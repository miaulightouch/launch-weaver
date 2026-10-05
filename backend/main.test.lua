local ready = false
os.time = function() return 1234567890 end
os.tmpname = function() return '/mock/tmp/optiscaler.tar.xz' end
local decoded_requests = {}
local symlinks = {}
local running_checks = 0
local running_from_check = math.huge
local running_app = 0
local unreadable_environment = false
local rename_fails = false
local tracker_reads_137 = 0
local defaults = '[Upscalers]\nDx12Upscaler=auto\n'
local archive_defaults = defaults
local files = {
    ['/mock/cache/protonfixes/upscalers/optiscaler_v0.9.3.tar.xz'] = 'ARCHIVE',
    ['/usr/bin/md5sum'] = true,
    ['/usr/bin/tar'] = true,
}

local function game(app_id, contents)
    local root = '/mock/steam/steamapps/compatdata/' .. app_id
    files[root .. '/upscaler_files'] = 'TRACKER'
    if contents then
        files[root .. '/pfx/drive_c/windows/system32/umu/OptiScaler.ini'] = contents
    end
end

game(124, 'custom remote')
game(125, '; lead\r\n[Upscalers]\r\n; Select the DirectX 12 upscaler.\r\nDx12Upscaler = fsr31 ; keep\r\n\r\n[Custom]\r\nFoo=bar\r\n')
game(126, '; lead\r\n[Upscalers]\r\nDx12Upscaler = fsr31 ; keep\r\n\r\n[Custom]\r\nFoo=bar\r\n')
for _, app_id in ipairs({ 127, 128, 129, 132, 135, 137, 139 }) do game(app_id, defaults) end
game(130, '[Upscalers]\nDx12Upscaler=xess\n')
game(131)
game(133, '[Upscalers]\nDx12Upscaler=auto\ndx12upscaler=xess\n')
game(136, '[A]\nx=1\n[B] junk\ny=2\n')
game(138, defaults)

local function fake_digest(contents)
    local value = 0
    for index = 1, #contents do
        value = (value * 33 + contents:byte(index)) % 4294967296
    end
    return ('%08x'):format(value):rep(4)
end

local function json_escape(value)
    return ('%q'):format(value)
end

local function encode(value)
    local kind = type(value)
    if kind == 'string' then return json_escape(value) end
    if kind == 'number' or kind == 'boolean' then return tostring(value) end
    if kind ~= 'table' then return 'null' end

    local parts = {}
    if #value > 0 then
        for _, item in ipairs(value) do
            table.insert(parts, encode(item))
        end
        return '[' .. table.concat(parts, ',') .. ']'
    end

    for key, item in pairs(value) do
        table.insert(parts, json_escape(key) .. ':' .. encode(item))
    end
    table.sort(parts)
    return '{' .. table.concat(parts, ',') .. '}'
end

package.preload.fs = function()
    return {
        canonical = function(path) return path end,
        copy = function(from, to) files[to] = files[from]; return true end,
        exists = function(path) return files[path] ~= nil end,
        file_size = function(path)
            return type(files[path]) == 'string' and #files[path] or nil
        end,
        is_file = function(path) return files[path] ~= nil end,
        is_symlink = function(path) return symlinks[path] == true end,
        join = function(...)
            return table.concat({ ... }, '/')
        end,
        list = function(path)
            if path == '/proc' then
                running_checks = running_checks + 1
                if running_checks >= running_from_check then
                    return { { is_directory = true, name = '999' } }
                end
                return {}
            end
        end,
        remove = function(path) files[path] = nil; return true end,
        rename = function(from, to)
            if rename_fails then return false end
            files[to] = files[from]
            files[from] = nil
            return true
        end,
    }
end
local downloads = 0
package.preload.http = function()
    return {
        get = function(url)
            assert(url == 'https://loathingkernel.github.io/proton-upscalers/manifest.json')
            return { body = 'MANIFEST', status = 200 }
        end,
        download = function(_, path)
            downloads = downloads + 1
            files[path] = 'ARCHIVE'
            return { success = true, status = 200, bytes_written = 7 }
        end,
    }
end
package.preload.json = function()
    return {
        decode = function(value)
            if decoded_requests[value] then
                return decoded_requests[value]
            end
            if value == 'TRACKER' then
                return {
                    opti_files = {
                        ['drive_c/windows/system32/umu/OptiScaler.dll'] = {
                            version = '0.9.3',
                        },
                    },
                }
            end
            if value == 'TRACKER_NEW' then
                return {
                    opti_files = {
                        ['drive_c/windows/system32/umu/OptiScaler.dll'] = {
                            version = '0.9.4',
                        },
                    },
                }
            end
            if value == 'MANIFEST' then
                return {
                    optiscaler = {
                        {
                            version = '0.9.3',
                            download_url = 'https://loathingKernel.github.io/proton-upscalers/optiscaler_v0.9.3.tar.xz',
                            zip_md5_hash = '14F3BB788BA6F6AA1432B6E7D5E596B7',
                            zip_file_size = 7,
                        },
                    },
                }
            end
            error('unexpected JSON fixture')
        end,
        encode = encode,
    }
end
package.preload.millennium = function()
    return {
        ready = function() ready = true end,
        steam_path = function() return '/mock/steam' end,
    }
end
package.preload.utils = function()
    return {
        getenv = function(name)
            if name == 'XDG_CACHE_HOME' then return '/mock/cache' end
        end,
        exec = function(command)
            if command:find('/usr/bin/md5sum', 1, true) == 1 then
                local path = command:match(" -- '([^']+)'$")
                if path and path:match('%.tar%.xz$') then
                    return '14f3bb788ba6f6aa1432b6e7d5e596b7  archive\n', 0
                end
                if path and type(files[path]) == 'string' then
                    return fake_digest(files[path]) .. '  file\n', 0
                end
                return nil, 1
            end
            if command:find('/usr/bin/tar', 1, true) then
                return archive_defaults, 0
            end
            error('unexpected command: ' .. command)
        end,
        read_file = function(path)
            if path == '/proc/self/status' or path == '/proc/999/status' then
                return 'Name:\ttest\nUid:\t1000\t1000\t1000\t1000\n'
            end
            if path == '/proc/999/environ' then
                if unreadable_environment then return nil end
                return 'SteamAppId=' .. tostring(running_app)
            end
            if path == '/mock/steam/steamapps/compatdata/137/upscaler_files' then
                tracker_reads_137 = tracker_reads_137 + 1
                if tracker_reads_137 >= 3 then return 'TRACKER_NEW' end
            end
            return files[path]
        end,
        uuid = function() return 'test-uuid' end,
        write_file = function(path, contents) files[path] = contents; return true end,
    }
end

local backend_main = arg[1] or 'backend/main.lua'
local backend_directory = backend_main:gsub('\\', '/'):match('^(.*)/[^/]+$') or '.'
package.path = backend_directory .. '/?.lua;' .. package.path

local plugin = dofile(backend_main)
local described = assert(require('ini').parse('[Section]\n; First line\n\n; Second line\nOption=auto\n'))
assert(described.rows[1].description == 'First line\nSecond line')

local function config_path(app_id)
    return ('/mock/steam/steamapps/compatdata/%d/pfx/drive_c/windows/system32/umu/OptiScaler.ini'):format(app_id)
end

local function snapshot_for(app_id)
    local contents = files[config_path(app_id)]
    if type(contents) ~= 'string' then
        return { digest = '', exists = false, size = 0, version = '0.9.3' }
    end
    return {
        digest = fake_digest(contents),
        exists = true,
        size = #contents,
        version = '0.9.3',
    }
end

local function request(name, app_id, body)
    body = body or {}
    body.app_id = app_id
    if body.mode and body.snapshot == nil then body.snapshot = snapshot_for(app_id) end
    decoded_requests[name] = body
    return name
end

local function patch_request(name, app_id, value, option)
    return request(name, app_id, {
        changes = {
            {
                action = 'set',
                option = option or 'Dx12Upscaler',
                section = 'Upscalers',
                value = value or 'xess',
            },
        },
        mode = 'patch',
    })
end

assert(read_optiscaler('invalid'):find('Invalid OptiScaler read request.', 1, true))

local original_124 = files[config_path(124)]
local remote_reset = apply_optiscaler(request('reset_124', 124, {
    mode = 'reset',
}))
assert(remote_reset:find('"ok":true', 1, true), remote_reset)
assert(downloads == 1)
assert(files[config_path(124)] == defaults)
assert(files[config_path(124) .. '.launch-weaver.1234567890.bak'] == original_124)
assert(files['/mock/tmp/optiscaler.tar.xz'] == nil)

archive_defaults = '[Upscalers]\nDx12Upscaler=auto\ndx12upscaler=xess\n'
local malformed_defaults = apply_optiscaler(request('reset_138', 138, {
    mode = 'reset',
}))
archive_defaults = defaults
assert(malformed_defaults:find('invalid OptiScaler.ini', 1, true), malformed_defaults)
assert(files[config_path(138)] == defaults)
assert(files[config_path(138) .. '.launch-weaver.1234567890.bak'] == nil)

local read = read_optiscaler(request('read_125', 125))
assert(read:find('"ok":true', 1, true), read)
assert(read:find('"path":"' .. config_path(125) .. '"', 1, true), read)
assert(read:find('"option":"Dx12Upscaler"', 1, true), read)
assert(read:find('"value":"fsr31"', 1, true), read)
assert(read:find('"description":"Select the DirectX 12 upscaler.', 1, true), read)
assert(read:find('"digest":"' .. snapshot_for(125).digest .. '"', 1, true), read)

local original_125 = files[config_path(125)]
local applied = apply_optiscaler(patch_request('apply_125', 125, 'xess', 'dx12upscaler'))
assert(applied:find('"ok":true', 1, true), applied)
assert(files[config_path(125)] == '; lead\r\n[Upscalers]\r\n; Select the DirectX 12 upscaler.\r\nDx12Upscaler = xess ; keep\r\n\r\n[Custom]\r\nFoo=bar\r\n')
assert(files[config_path(125) .. '.launch-weaver.1234567890.bak'] == original_125)

local original_126 = files[config_path(126)]
local removed = apply_optiscaler(request('apply_126', 126, {
    changes = {
        { action = 'remove', section = 'Upscalers', option = 'DX12UPSCALER' },
        { action = 'remove', section = 'Custom', option = 'foo' },
    },
    mode = 'patch',
}))
assert(removed:find('"ok":true', 1, true), removed)
assert(files[config_path(126)] == '; lead\r\n[Upscalers]\r\nDx12Upscaler = auto ; keep\r\n\r\n[Custom]\r\n')
assert(files[config_path(126) .. '.launch-weaver.1234567890.bak'] == original_126)

local unknown = apply_optiscaler(patch_request('unknown_127', 127, '1', 'Missing'))
assert(unknown:find('Unknown OptiScaler option', 1, true), unknown)
assert(files[config_path(127)] == '[Upscalers]\nDx12Upscaler=auto\n')

local invalid_snapshot = apply_optiscaler(request('invalid_snapshot_127', 127, {
    changes = {},
    mode = 'patch',
    snapshot = {},
}))
assert(invalid_snapshot:find('Invalid OptiScaler apply request.', 1, true), invalid_snapshot)

local ambiguous = apply_optiscaler(patch_request('ambiguous_127', 127, 'xess ;comment'))
assert(ambiguous:find('Invalid OptiScaler value', 1, true), ambiguous)
assert(files[config_path(127)] == '[Upscalers]\nDx12Upscaler=auto\n')

local stale_request = patch_request('stale_128', 128)
files[config_path(128)] = '[Upscalers]\nDx12Upscaler=fsr31\n'
local stale = apply_optiscaler(stale_request)
assert(stale:find('OptiScaler.ini changed after the editor opened.', 1, true), stale)
assert(files[config_path(128)] == '[Upscalers]\nDx12Upscaler=fsr31\n')

local original_129 = files[config_path(129)]
local running_request = patch_request('running_129', 129)
running_checks = 0
running_from_check = 3
running_app = 129
local became_running = apply_optiscaler(running_request)
assert(became_running:find('Close the game before editing OptiScaler.ini.', 1, true), became_running)
assert(files[config_path(129)] == original_129)
assert(files['/mock/steam/steamapps/compatdata/129/pfx/drive_c/windows/system32/umu/.OptiScaler.ini.launch-weaver.test-uuid.tmp'] == nil)

running_checks = 0
running_from_check = 4
local started_after_backup = apply_optiscaler(running_request)
local running_backup = config_path(129) .. '.launch-weaver.1234567890.bak'
assert(started_after_backup:find('"backup":"' .. running_backup .. '"', 1, true), started_after_backup)
assert(files[running_backup] == original_129)

running_checks = 0
running_from_check = 5
local started_before_rename = apply_optiscaler(running_request)
assert(started_before_rename:find('Close the game before editing OptiScaler.ini.', 1, true), started_before_rename)
assert(files[config_path(129)] == original_129)
local final_backup = config_path(129) .. '.launch-weaver.test-uuid.bak'
assert(started_before_rename:find('"backup":"' .. final_backup .. '"', 1, true), started_before_rename)
assert(files[final_backup] == original_129)
assert(files['/mock/steam/steamapps/compatdata/129/pfx/drive_c/windows/system32/umu/.OptiScaler.ini.launch-weaver.test-uuid.tmp'] == nil)
running_from_check = math.huge
running_app = 0

local original_139 = files[config_path(139)]
running_checks = 0
running_from_check = 1
unreadable_environment = true
local unreadable = apply_optiscaler(patch_request('unreadable_139', 139))
unreadable_environment = false
running_from_check = math.huge
assert(unreadable:find('Could not verify whether the game is running.', 1, true), unreadable)
assert(files[config_path(139)] == original_139)
assert(files['/mock/steam/steamapps/compatdata/139/pfx/drive_c/windows/system32/umu/.OptiScaler.ini.launch-weaver.test-uuid.tmp'] == nil)
assert(files[config_path(139) .. '.launch-weaver.1234567890.bak'] == nil)

local original_130 = files[config_path(130)]
local invalid_reset = apply_optiscaler(request('invalid_reset_130', 130, {
    changes = {
        { action = 'set', section = 'Upscalers', option = 'Dx12Upscaler', value = 'auto' },
    },
    mode = 'reset',
}))
assert(invalid_reset:find('Reset does not accept OptiScaler changes.', 1, true), invalid_reset)
assert(files[config_path(130)] == original_130)

local applied_reset = apply_optiscaler(request('reset_130', 130, {
    mode = 'reset',
}))
assert(applied_reset:find('"ok":true', 1, true), applied_reset)
assert(files[config_path(130)] == defaults)
assert(files[config_path(130) .. '.launch-weaver.1234567890.bak'] == original_130)

local missing = read_optiscaler(request('read_131', 131))
assert(missing:find('"exists":false', 1, true), missing)
assert(missing:find('"rows":[]', 1, true), missing)
local created = apply_optiscaler(request('reset_131', 131, {
    mode = 'reset',
}))
assert(created:find('"ok":true', 1, true), created)
assert(files[config_path(131)] == defaults)

local original_132 = files[config_path(132)]
local rename_request = patch_request('rename_132', 132)
rename_fails = true
local rename_failed = apply_optiscaler(rename_request)
rename_fails = false
assert(rename_failed:find('atomically replace', 1, true), rename_failed)
assert(files[config_path(132)] == original_132)
local rename_backup = config_path(132) .. '.launch-weaver.1234567890.bak'
assert(rename_failed:find('"backup":"' .. rename_backup .. '"', 1, true), rename_failed)
assert(files[rename_backup] == original_132)

local duplicate = read_optiscaler(request('read_133', 133))
assert(duplicate:find('Duplicate OptiScaler option', 1, true), duplicate)

files['/mock/steam/steamapps/compatdata/134/upscaler_files'] = 'TRACKER'
files[config_path(134)] = defaults
symlinks[config_path(134)] = true
local unsafe = read_optiscaler(request('read_134', 134))
assert(unsafe:find('Refusing to use a symbolic-link OptiScaler.ini.', 1, true), unsafe)

local original_135 = files[config_path(135)]
local broken_backup_135 = config_path(135) .. '.launch-weaver.1234567890.bak'
symlinks[broken_backup_135] = true
local avoided_symlink = apply_optiscaler(patch_request('apply_135', 135))
assert(avoided_symlink:find('"ok":true', 1, true), avoided_symlink)
assert(files[broken_backup_135] == nil)
assert(files[config_path(135) .. '.launch-weaver.test-uuid.bak'] == original_135)

local malformed_section = read_optiscaler(request('read_136', 136))
assert(malformed_section:find('Invalid OptiScaler section header on line 3.', 1, true), malformed_section)
assert(not malformed_section:find('"option":"y"', 1, true), malformed_section)

local original_137 = files[config_path(137)]
local changed_tracker = apply_optiscaler(patch_request('changed_tracker_137', 137))
assert(changed_tracker:find('installation changed before the atomic replace', 1, true), changed_tracker)
assert(changed_tracker:find('"backup":', 1, true), changed_tracker)
assert(files[config_path(137)] == original_137)

assert(read_optiscaler('not-json'):find('Invalid OptiScaler read request.', 1, true))

plugin.on_load()
assert(ready)

-- Current upstream ProcessFilter values are filenames/lists, not booleans.
local current_ini = '[ProcessFilter]\r\nTargetProcessName=auto ; target\r\nProcessExclusionList=auto\r\n[FrameGen]\r\nFGNvngxReplacement=auto\r\n'
local ini_parser = require('ini')
local filter_changes = assert(ini_parser.normalize_changes({
    { action = 'set', section = 'ProcessFilter', option = 'TargetProcessName', value = 'Endfield.exe' },
    { action = 'set', section = 'ProcessFilter', option = 'ProcessExclusionList', value = 'launcher.exe|crashpad_handler.exe' },
}))
local filtered_ini = assert(ini_parser.patch(current_ini, filter_changes))
assert(filtered_ini == '[ProcessFilter]\r\nTargetProcessName=Endfield.exe ; target\r\nProcessExclusionList=launcher.exe|crashpad_handler.exe\r\n[FrameGen]\r\nFGNvngxReplacement=auto\r\n')
