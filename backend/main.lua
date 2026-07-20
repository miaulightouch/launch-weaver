local fs = require('fs')
local http = require('http')
local json = require('json')
local millennium = require('millennium')
local utils = require('utils')
local ini = require('ini')

local MANIFEST_URL = 'https://loathingkernel.github.io/proton-upscalers/manifest.json'
local MAX_MANIFEST_SIZE = 16 * 1024 * 1024
local MAX_ARCHIVE_SIZE = 64 * 1024 * 1024
local MAX_INI_SIZE = ini.max_size
local MAX_REQUEST_SIZE = 4 * 1024 * 1024
local OPTI_PREFIX = 'drive_c/windows/system32/umu/'

local function read_response(path, rows, snapshot)
    local encoded_rows = {}
    for _, row in ipairs(rows) do
        table.insert(encoded_rows, json.encode(row))
    end
    return '{"ok":true,"path":' .. json.encode(path)
        .. ',"rows":[' .. table.concat(encoded_rows, ',') .. ']'
        .. ',"snapshot":' .. json.encode(snapshot) .. '}'
end

local function failure(message, backup)
    return json.encode({ ok = false, error = message, backup = backup })
end

local function valid_app_id(value)
    return type(value) == 'number' and value % 1 == 0 and value >= 1 and value <= 4294967295
end

local function shell_quote(value)
    return "'" .. value:gsub("'", [['"'"']]) .. "'"
end

local function path_is_within(path, root)
    return path == root or path:sub(1, #root + 1) == root .. '/'
end

local function decode_file(path, max_size)
    local size = fs.file_size(path)
    if not size or size <= 0 or size > max_size then
        return nil
    end

    local contents = utils.read_file(path)
    if not contents then
        return nil
    end

    local ok, decoded = pcall(json.decode, contents)
    if not ok or type(decoded) ~= 'table' then
        return nil
    end
    return decoded
end

local function find_manifest_item(manifest, version)
    local matches = {}
    if type(manifest.optiscaler) ~= 'table' then
        return nil
    end

    for _, item in ipairs(manifest.optiscaler) do
        if type(item) == 'table' and item.version == version then
            table.insert(matches, item)
        end
    end

    if #matches ~= 1 then
        return nil
    end

    local item = matches[1]
    local expected_url = ('https://loathingkernel.github.io/proton-upscalers/optiscaler_v%s.tar.xz'):format(version)
    if type(item.download_url) ~= 'string' or item.download_url:lower() ~= expected_url then
        return nil
    end
    if type(item.zip_md5_hash) ~= 'string' or not item.zip_md5_hash:match('^[%da-fA-F]+$') or #item.zip_md5_hash ~= 32 then
        return nil
    end
    if type(item.zip_file_size) ~= 'number' or item.zip_file_size <= 0 or item.zip_file_size > MAX_ARCHIVE_SIZE then
        return nil
    end
    return item
end

local function valid_version(value)
    if type(value) ~= 'string' or value:sub(1, 1) == '.' or value:sub(-1) == '.' or value:find('..', 1, true) then
        return false
    end

    local parts = 0
    for part in value:gmatch('[^.]+') do
        if not part:match('^%d+$') then
            return false
        end
        parts = parts + 1
    end
    return parts >= 3
end

local function get_manifest_item(version)
    local reply = http.get(MANIFEST_URL, {
        timeout = 20,
        user_agent = 'LaunchWeaver/0.1',
        verify_ssl = true,
    })
    if not reply or reply.status ~= 200 or type(reply.body) ~= 'string' or #reply.body > MAX_MANIFEST_SIZE then
        return nil, 'Could not load the official OptiScaler manifest.'
    end

    local ok, manifest = pcall(json.decode, reply.body)
    local item = ok and type(manifest) == 'table' and find_manifest_item(manifest, version)
    if not item then
        return nil, 'The installed OptiScaler version is absent from the official manifest.'
    end
    return item
end

local function installed_version(tracker)
    local decoded = decode_file(tracker, 2 * 1024 * 1024)
    local entries = decoded and decoded.opti_files
    if type(entries) ~= 'table' then
        return nil
    end

    local version
    for path, metadata in pairs(entries) do
        if type(path) ~= 'string' or path:sub(1, #OPTI_PREFIX) ~= OPTI_PREFIX or type(metadata) ~= 'table' then
            return nil
        end
        if not valid_version(metadata.version) then
            return nil
        end
        if version and version ~= metadata.version then
            return nil
        end
        version = metadata.version
    end
    return version
end

local function library_roots(steam_path)
    local roots = { steam_path }
    local seen = { [steam_path] = true }

    for _, vdf in ipairs({
        fs.join(steam_path, 'steamapps', 'libraryfolders.vdf'),
        fs.join(steam_path, 'config', 'libraryfolders.vdf'),
    }) do
        local contents = utils.read_file(vdf)
        if contents then
            for raw_path in contents:gmatch('"path"%s*"([^"\r\n]+)"') do
                local path = raw_path:gsub('\\\\', '\\')
                if path:sub(1, 1) == '/' and not seen[path] then
                    seen[path] = true
                    table.insert(roots, path)
                end
            end
        end
    end
    return roots
end

local function find_compat_dir(app_id)
    local steam_path = millennium.steam_path()
    if type(steam_path) ~= 'string' or steam_path:sub(1, 1) ~= '/' then
        return nil, 'OptiScaler reset is available only on Linux.'
    end

    local found = {}
    local seen = {}
    for _, root in ipairs(library_roots(steam_path)) do
        local compat = fs.join(root, 'steamapps', 'compatdata', tostring(app_id))
        local tracker = fs.join(compat, 'upscaler_files')
        if fs.is_file(tracker) then
            local canonical = fs.canonical(compat)
            if canonical and not seen[canonical] then
                seen[canonical] = true
                table.insert(found, canonical)
            end
        end
    end

    if #found == 0 then
        return nil, 'No OptiScaler installation was found for this game.'
    end
    if #found > 1 then
        return nil, 'More than one compatibility prefix exists for this game.'
    end
    return found[1]
end

local function read_uids(path)
    local status = utils.read_file(path)
    if type(status) ~= 'string' then
        return nil
    end
    return ('\n' .. status):match('\nUid:[ \t]+(%d+)[ \t]+(%d+)')
end

local function app_is_running(app_id, compat_dir)
    local processes = fs.list('/proc')
    if type(processes) ~= 'table' then
        return nil
    end
    local self_real_uid, self_effective_uid = read_uids('/proc/self/status')
    if not self_real_uid or not self_effective_uid then
        return nil
    end

    local app_marker = '\0SteamAppId=' .. tostring(app_id) .. '\0'
    local game_marker = '\0SteamGameId=' .. tostring(app_id) .. '\0'
    local compat_marker = '\0STEAM_COMPAT_DATA_PATH=' .. compat_dir .. '\0'
    for _, entry in ipairs(processes) do
        if entry.is_directory and entry.name:match('^%d+$') then
            local process_root = fs.join('/proc', entry.name)
            local environment = utils.read_file(fs.join(process_root, 'environ'))
            if type(environment) == 'string' then
                environment = '\0' .. environment .. '\0'
                if environment:find(app_marker, 1, true)
                    or environment:find(game_marker, 1, true)
                    or environment:find(compat_marker, 1, true)
                then
                    return true
                end
            else
                local real_uid, effective_uid = read_uids(fs.join(process_root, 'status'))
                if real_uid == self_real_uid
                    or real_uid == self_effective_uid
                    or effective_uid == self_real_uid
                    or effective_uid == self_effective_uid
                then
                    return nil
                end
            end
        end
    end
    return false
end

local function md5(path)
    if not fs.is_file('/usr/bin/md5sum') then
        return nil
    end
    local output, status = utils.exec('/usr/bin/md5sum -- ' .. shell_quote(path))
    if status ~= 0 or type(output) ~= 'string' then
        return nil
    end
    return output:match('^([%da-fA-F]+)')
end

local function verified_archive(item)
    local temporary = os.tmpname()
    if type(temporary) ~= 'string' or temporary == '' then
        return nil, 'Could not create a temporary OptiScaler archive path.'
    end
    local reply = http.download(item.download_url, temporary, {
        timeout = 30,
        follow_redirects = true,
        user_agent = 'LaunchWeaver/0.1',
        verify_ssl = true,
    })
    local size = fs.file_size(temporary)
    if not reply
        or reply.success ~= true
        or reply.status ~= 200
        or reply.bytes_written ~= item.zip_file_size
        or size ~= item.zip_file_size
    then
        fs.remove(temporary)
        return nil, 'Could not download the exact installed OptiScaler archive.'
    end

    local digest = md5(temporary)
    if not digest or digest:lower() ~= item.zip_md5_hash:lower() then
        fs.remove(temporary)
        return nil, 'The OptiScaler archive checksum did not match the official manifest.'
    end
    return temporary
end

local function extract_default_ini(archive)
    if not fs.is_file('/usr/bin/tar') then
        return nil
    end

    for _, name in ipairs({ 'OptiScaler.ini', './OptiScaler.ini' }) do
        local command = 'PATH=/usr/bin:/bin /usr/bin/tar --extract --xz --to-stdout --file '
            .. shell_quote(archive) .. ' -- ' .. shell_quote(name) .. ' 2>/dev/null'
        local contents, status = utils.exec(command)
        if status == 0 and type(contents) == 'string' and #contents > 0 then
            if #contents <= MAX_INI_SIZE and not contents:find('\0', 1, true) and contents:match('%[[^%]\r\n]+%]') then
                return contents
            end
            return nil
        end
    end
end

local function decode_request(request_json)
    if type(request_json) ~= 'string' or request_json == '' or #request_json > MAX_REQUEST_SIZE then
        return nil
    end

    local ok, request = pcall(json.decode, request_json)
    if not ok or type(request) ~= 'table' then
        return nil
    end
    return request
end

local function resolve_optiscaler_target(app_id)
    local compat_dir, compat_error = find_compat_dir(app_id)
    if not compat_dir then
        return nil, compat_error
    end

    local tracker = fs.join(compat_dir, 'upscaler_files')
    local tracker_real = fs.canonical(tracker)
    if not tracker_real or fs.is_symlink(tracker) or not path_is_within(tracker_real, compat_dir) then
        return nil, 'The OptiScaler version tracker is unsafe to use.'
    end

    local version = installed_version(tracker_real)
    if not version then
        return nil, 'The exact installed OptiScaler version could not be determined.'
    end

    local umu = fs.join(compat_dir, 'pfx', 'drive_c', 'windows', 'system32', 'umu')
    local umu_real = fs.canonical(umu)
    if not umu_real or not path_is_within(umu_real, compat_dir) then
        return nil, 'The OptiScaler installation directory is unsafe to use.'
    end

    local config = fs.join(umu_real, 'OptiScaler.ini')
    if fs.is_symlink(config) then
        return nil, 'Refusing to use a symbolic-link OptiScaler.ini.'
    end
    if fs.exists(config) and not fs.is_file(config) then
        return nil, 'Refusing to use a non-regular OptiScaler.ini.'
    end

    return {
        app_id = app_id,
        compat_dir = compat_dir,
        config = config,
        umu = umu_real,
        version = version,
    }
end

local function targets_match(left, right)
    return left.app_id == right.app_id
        and left.compat_dir == right.compat_dir
        and left.config == right.config
        and left.umu == right.umu
        and left.version == right.version
end

local function read_stable_ini(target)
    local config = target.config
    if fs.is_symlink(config) then
        return nil, nil, 'Refusing to use a symbolic-link OptiScaler.ini.'
    end
    if not fs.exists(config) then
        return nil, {
            digest = '',
            exists = false,
            size = 0,
            version = target.version,
        }
    end
    if not fs.is_file(config) then
        return nil, nil, 'Refusing to use a non-regular OptiScaler.ini.'
    end

    local size = fs.file_size(config)
    if type(size) ~= 'number' or size < 0 or size > MAX_INI_SIZE then
        return nil, nil, 'OptiScaler.ini is too large or unreadable.'
    end

    local contents = utils.read_file(config)
    if type(contents) ~= 'string' or #contents ~= size or contents:find('\0', 1, true) then
        return nil, nil, 'OptiScaler.ini could not be read safely.'
    end

    local digest = md5(config)
    local confirmed = utils.read_file(config)
    local confirmed_size = fs.file_size(config)
    if type(digest) ~= 'string'
        or #digest ~= 32
        or not digest:match('^[%da-fA-F]+$')
        or confirmed ~= contents
        or confirmed_size ~= size
    then
        return nil, nil, 'OptiScaler.ini changed while it was being read.'
    end

    return contents, {
        digest = digest:lower(),
        exists = true,
        size = size,
        version = target.version,
    }
end

local function valid_snapshot(snapshot)
    if type(snapshot) ~= 'table'
        or type(snapshot.exists) ~= 'boolean'
        or not valid_version(snapshot.version)
        or type(snapshot.size) ~= 'number'
        or snapshot.size % 1 ~= 0
        or snapshot.size < 0
        or snapshot.size > MAX_INI_SIZE
        or type(snapshot.digest) ~= 'string'
    then
        return false
    end

    if snapshot.exists then
        return #snapshot.digest == 32
            and snapshot.digest:match('^[%da-fA-F]+$') ~= nil
    end
    return snapshot.size == 0 and snapshot.digest == ''
end

local function snapshots_match(expected, actual)
    return expected.exists == actual.exists
        and expected.version == actual.version
        and expected.size == actual.size
        and expected.digest:lower() == actual.digest
end

local function load_exact_defaults(version)
    local item, manifest_error = get_manifest_item(version)
    if not item then
        return nil, manifest_error
    end

    local archive, archive_error = verified_archive(item)
    if not archive then
        return nil, archive_error
    end

    local defaults = extract_default_ini(archive)
    fs.remove(archive)
    if not defaults then
        return nil, 'The official archive did not contain a valid OptiScaler.ini.'
    end
    if not ini.parse(defaults) then
        return nil, 'The official archive contained an invalid OptiScaler.ini.'
    end
    return defaults
end

local function stopped(target)
    local running = app_is_running(target.app_id, target.compat_dir)
    if running == nil then
        return false, 'Could not verify whether the game is running.'
    end
    if running then
        return false, 'Close the game before editing OptiScaler.ini.'
    end
    return true
end

local function safe_uuid()
    local value = utils.uuid()
    return type(value) == 'string' and value:match('^[%w%-]+$') or nil
end

local function prepare_temporary_config(target, current, replacement)
    local suffix = safe_uuid()
    if not suffix then
        return nil, 'Could not create a safe temporary filename.'
    end

    local temporary = fs.join(target.umu, '.OptiScaler.ini.launch-weaver.' .. suffix .. '.tmp')
    if fs.exists(temporary) or fs.is_symlink(temporary) then
        return nil, 'The temporary OptiScaler.ini path already exists.'
    end

    if current ~= nil and not fs.copy(target.config, temporary) then
        return nil, 'Could not prepare the replacement OptiScaler.ini.'
    end
    local written = utils.write_file(temporary, replacement)
    if not written or utils.read_file(temporary) ~= replacement then
        fs.remove(temporary)
        return nil, 'Could not write the replacement OptiScaler.ini.'
    end
    return temporary
end

local function backup_config(target, current)
    if current == nil then
        return ''
    end

    local backup = target.config .. '.launch-weaver.' .. tostring(os.time()) .. '.bak'
    if fs.exists(backup) or fs.is_symlink(backup) then
        local suffix = safe_uuid()
        if not suffix then
            return nil, 'Could not create a safe backup filename.'
        end
        backup = target.config .. '.launch-weaver.' .. suffix .. '.bak'
        if fs.exists(backup) or fs.is_symlink(backup) then
            return nil, 'The OptiScaler.ini backup path already exists.'
        end
    end

    if not fs.copy(target.config, backup) or utils.read_file(backup) ~= current then
        fs.remove(backup)
        return nil, 'Could not verify the OptiScaler.ini backup.'
    end
    return backup
end

function read_optiscaler(request_json)
    local request = decode_request(request_json)
    if not request or not valid_app_id(request.app_id) then
        return failure('Invalid OptiScaler read request.')
    end
    if not fs.is_file('/usr/bin/md5sum') then
        return failure('OptiScaler editing requires /usr/bin/md5sum.')
    end

    local target, target_error = resolve_optiscaler_target(request.app_id)
    if not target then
        return failure(target_error)
    end

    local contents, snapshot, read_error = read_stable_ini(target)
    if read_error then
        return failure(read_error)
    end

    local rows = {}
    if contents ~= nil then
        local parsed, parse_error = ini.parse(contents)
        if not parsed then
            return failure(parse_error)
        end
        rows = parsed.rows
    end

    return read_response(target.config, rows, snapshot)
end

function apply_optiscaler(request_json)
    local request = decode_request(request_json)
    if not request
        or not valid_app_id(request.app_id)
        or (request.mode ~= 'patch' and request.mode ~= 'reset')
        or not valid_snapshot(request.snapshot)
    then
        return failure('Invalid OptiScaler apply request.')
    end
    if not fs.is_file('/usr/bin/md5sum') then
        return failure('OptiScaler editing requires /usr/bin/md5sum.')
    end

    local changes = {}
    if request.mode == 'patch' then
        local change_error
        changes, change_error = ini.normalize_changes(request.changes)
        if not changes then
            return failure(change_error)
        end
    elseif request.changes ~= nil
        and (type(request.changes) ~= 'table' or next(request.changes) ~= nil)
    then
        return failure('Reset does not accept OptiScaler changes.')
    end

    local target, target_error = resolve_optiscaler_target(request.app_id)
    if not target then
        return failure(target_error)
    end
    if target.version ~= request.snapshot.version then
        return failure('The installed OptiScaler version changed; reopen the editor.')
    end

    local is_stopped, running_error = stopped(target)
    if not is_stopped then
        return failure(running_error)
    end

    local current, current_snapshot, read_error = read_stable_ini(target)
    if read_error then
        return failure(read_error)
    end
    if not snapshots_match(request.snapshot, current_snapshot) then
        return failure('OptiScaler.ini changed after the editor opened.')
    end
    if request.mode == 'patch' and current == nil then
        return failure('OptiScaler.ini is missing; reset it before editing.')
    end

    if request.mode == 'patch' then
        local parsed, parse_error = ini.parse(current)
        if not parsed then
            return failure(parse_error)
        end
        local existing, existing_error = ini.changes_exist(parsed, changes)
        if not existing then
            return failure(existing_error)
        end
    end

    local needs_defaults = request.mode == 'reset'
    if not needs_defaults then
        for _, change in ipairs(changes) do
            if change.action == 'remove' then
                needs_defaults = true
                break
            end
        end
    end

    local defaults
    if needs_defaults then
        if not fs.is_file('/usr/bin/tar') then
            return failure('OptiScaler defaults require /usr/bin/tar.')
        end
        local defaults_error
        defaults, defaults_error = load_exact_defaults(target.version)
        if not defaults then
            return failure(defaults_error)
        end
    end

    local refreshed, refresh_error = resolve_optiscaler_target(request.app_id)
    if not refreshed then
        return failure(refresh_error)
    end
    if not targets_match(target, refreshed) then
        return failure('The OptiScaler installation changed; reopen the editor.')
    end
    target = refreshed

    is_stopped, running_error = stopped(target)
    if not is_stopped then
        return failure(running_error)
    end

    current, current_snapshot, read_error = read_stable_ini(target)
    if read_error then
        return failure(read_error)
    end
    if not snapshots_match(request.snapshot, current_snapshot) then
        return failure('OptiScaler.ini changed while the edit was being prepared.')
    end

    local replacement
    if request.mode == 'reset' then
        replacement = defaults
    else
        local patch_error
        replacement, patch_error = ini.patch(current, changes, defaults)
        if not replacement then
            return failure(patch_error)
        end
    end

    if replacement == current then
        return json.encode({ ok = true })
    end

    local temporary, temporary_error = prepare_temporary_config(target, current, replacement)
    if not temporary then
        return failure(temporary_error)
    end

    is_stopped, running_error = stopped(target)
    if not is_stopped then
        fs.remove(temporary)
        return failure(running_error)
    end

    local latest, latest_snapshot, latest_error = read_stable_ini(target)
    if latest_error or not snapshots_match(request.snapshot, latest_snapshot) then
        fs.remove(temporary)
        return failure(latest_error or 'OptiScaler.ini changed before it could be saved.')
    end

    local backup, backup_error = backup_config(target, latest)
    if not backup then
        fs.remove(temporary)
        return failure(backup_error)
    end

    is_stopped, running_error = stopped(target)
    if not is_stopped then
        fs.remove(temporary)
        return failure(running_error, backup)
    end

    local final_current, final_snapshot, final_error = read_stable_ini(target)
    if final_error or not snapshots_match(request.snapshot, final_snapshot) then
        fs.remove(temporary)
        return failure(
            final_error or 'OptiScaler.ini changed before the atomic replace.',
            backup
        )
    end
    if final_current ~= latest then
        fs.remove(temporary)
        return failure(
            'OptiScaler.ini changed before the atomic replace.',
            backup
        )
    end

    local final_target, final_target_error = resolve_optiscaler_target(request.app_id)
    if not final_target then
        fs.remove(temporary)
        return failure(final_target_error, backup)
    end
    if not targets_match(target, final_target) then
        fs.remove(temporary)
        return failure(
            'The OptiScaler installation changed before the atomic replace.',
            backup
        )
    end
    target = final_target

    is_stopped, running_error = stopped(target)
    if not is_stopped then
        fs.remove(temporary)
        return failure(running_error, backup)
    end

    if not fs.rename(temporary, target.config) then
        fs.remove(temporary)
        return failure(
            'Could not atomically replace OptiScaler.ini; the original is unchanged.',
            backup
        )
    end

    local written, _, written_error = read_stable_ini(target)
    if written_error or written ~= replacement then
        return failure(
            written_error or 'The replacement OptiScaler.ini could not be verified.',
            backup
        )
    end

    return json.encode({ ok = true })
end

return {
    on_load = function()
        millennium.ready()
    end,
}
