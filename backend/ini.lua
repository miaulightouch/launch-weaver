local MAX_SIZE = 2 * 1024 * 1024
local MAX_CHANGES = 2048

local function trim(value)
    return value:match('^%s*(.-)%s*$')
end

local function has_line_control(value)
    return value:find('\0', 1, true) or value:find('\r', 1, true) or value:find('\n', 1, true)
end

local function split_lines(contents)
    local lines = {}
    local position = 1
    while position <= #contents do
        local newline_start = contents:find('[\r\n]', position)
        if not newline_start then
            table.insert(lines, { body = contents:sub(position), newline = '' })
            break
        end

        local newline_end = newline_start
        if contents:sub(newline_start, newline_start) == '\r'
            and contents:sub(newline_start + 1, newline_start + 1) == '\n'
        then
            newline_end = newline_start + 1
        end
        table.insert(lines, {
            body = contents:sub(position, newline_start - 1),
            newline = contents:sub(newline_start, newline_end),
        })
        position = newline_end + 1
    end
    return lines
end

local function parse_section(body, first_line)
    local candidate = body
    if first_line and candidate:sub(1, 3) == '\239\187\191' then
        candidate = candidate:sub(4)
    end

    local starts_section = trim(candidate):sub(1, 1) == '['
    local name, suffix = candidate:match('^%s*%[([^%]]+)%](.*)$')
    if not name then
        return nil, starts_section
    end
    suffix = trim(suffix)
    if suffix ~= '' and suffix:sub(1, 1) ~= ';' and suffix:sub(1, 1) ~= '#' then
        return nil, true
    end

    name = trim(name)
    if name == '' then
        return nil, true
    end
    return name, false
end

local function parse_assignment(body)
    local stripped = trim(body)
    local first = stripped:sub(1, 1)
    if stripped == '' or first == ';' or first == '#' then
        return nil
    end

    local equals = body:find('=', 1, true)
    if not equals then
        return nil
    end

    local option = trim(body:sub(1, equals - 1))
    if option == '' or option:find('[%[%]]') then
        return nil
    end

    local right = body:sub(equals + 1)
    local leading = right:match('^(%s*)') or ''
    local remainder = right:sub(#leading + 1)
    local value_part = remainder
    local comment = ''
    if remainder:sub(1, 1) == ';' or remainder:sub(1, 1) == '#' then
        value_part = ''
        comment = remainder
    else
        local before_comment, found_comment = remainder:match('^(.-)(%s+[;#].*)$')
        if found_comment then
            value_part = before_comment
            comment = found_comment
        end
    end

    local value, trailing = value_part:match('^(.-)(%s*)$')
    return {
        option = option,
        prefix = body:sub(1, equals) .. leading,
        suffix = (trailing or '') .. comment,
        value = value or '',
    }
end

local function key(section, option)
    return section .. '\0' .. option:lower()
end

local function parse(contents)
    local lines = split_lines(contents)
    local index = {}
    local rows = {}
    local section

    for line_index, line in ipairs(lines) do
        local found_section, malformed_section = parse_section(line.body, line_index == 1)
        if malformed_section then
            return nil, ('Invalid OptiScaler section header on line %d.'):format(line_index)
        end
        if found_section then
            section = found_section
        elseif section then
            local assignment = parse_assignment(line.body)
            if assignment then
                local assignment_key = key(section, assignment.option)
                if index[assignment_key] then
                    return nil, ('Duplicate OptiScaler option: %s.%s'):format(section, assignment.option)
                end
                assignment.line = line_index
                line.assignment = assignment
                index[assignment_key] = assignment
                table.insert(rows, {
                    option = assignment.option,
                    section = section,
                    value = assignment.value,
                })
            end
        end
    end

    return { index = index, lines = lines, rows = rows }
end

local function valid_name(value, is_section)
    if type(value) ~= 'string' or #value > 256 or has_line_control(value) then
        return nil
    end
    value = trim(value)
    local first = value:sub(1, 1)
    if value == '' or first == ';' or first == '#' or value:find('=', 1, true) then
        return nil
    end
    if is_section and value:find(']', 1, true) then
        return nil
    end
    return value
end

local function normalize_changes(changes)
    if type(changes) ~= 'table' or #changes > MAX_CHANGES then
        return nil, 'Invalid OptiScaler changes.'
    end

    local normalized = {}
    local seen = {}
    for _, change in ipairs(changes) do
        if type(change) ~= 'table' or (change.action ~= 'set' and change.action ~= 'remove') then
            return nil, 'Invalid OptiScaler change action.'
        end

        local section = valid_name(change.section, true)
        local option = valid_name(change.option, false)
        if not section or not option then
            return nil, 'Invalid OptiScaler section or option.'
        end
        if change.action == 'set'
            and (type(change.value) ~= 'string'
                or #change.value > MAX_SIZE
                or has_line_control(change.value)
                or change.value:match('^%s')
                or change.value:match('%s$')
                or change.value:match('^%s*[;#]')
                or change.value:match('%s[;#]'))
        then
            return nil, 'Invalid OptiScaler value.'
        end

        local change_key = key(section, option)
        if seen[change_key] then
            return nil, ('Duplicate OptiScaler change: %s.%s'):format(section, option)
        end
        seen[change_key] = true
        table.insert(normalized, {
            action = change.action,
            key = change_key,
            option = option,
            section = section,
            value = change.value,
        })
    end
    return normalized
end

local function changes_exist(parsed, changes)
    for _, change in ipairs(changes) do
        if not parsed.index[change.key] then
            return false, ('Unknown OptiScaler option: %s.%s'):format(change.section, change.option)
        end
    end
    return true
end

local function patch(contents, changes, defaults)
    local parsed, parse_error = parse(contents)
    if not parsed then
        return nil, parse_error
    end
    local existing, existing_error = changes_exist(parsed, changes)
    if not existing then
        return nil, existing_error
    end

    local default_index = {}
    if defaults then
        local parsed_defaults, default_error = parse(defaults)
        if not parsed_defaults then
            return nil, 'The exact-version default INI is invalid: ' .. default_error
        end
        default_index = parsed_defaults.index
    end

    local replacements = {}
    for _, change in ipairs(changes) do
        local current = parsed.index[change.key]
        if change.action == 'set' then
            replacements[current.line] = { value = change.value }
        else
            local default = default_index[change.key]
            replacements[current.line] = default and { value = default.value } or { remove = true }
        end
    end

    local output = {}
    for line_index, line in ipairs(parsed.lines) do
        local replacement = replacements[line_index]
        if not replacement or not replacement.remove then
            local body = line.body
            if replacement then
                body = line.assignment.prefix .. replacement.value .. line.assignment.suffix
            end
            table.insert(output, body .. line.newline)
        end
    end

    local patched = table.concat(output)
    if #patched > MAX_SIZE or patched:find('\0', 1, true) then
        return nil, 'The edited OptiScaler.ini is invalid or too large.'
    end
    return patched
end

return {
    changes_exist = changes_exist,
    max_size = MAX_SIZE,
    normalize_changes = normalize_changes,
    parse = parse,
    patch = patch,
}
