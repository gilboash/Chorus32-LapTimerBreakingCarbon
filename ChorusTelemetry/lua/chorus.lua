SCRIPT_HOME = "/SCRIPTS/BF"
protocol = assert(loadScript(SCRIPT_HOME.."/protocols.lua"))()

assert(loadScript(protocol.transport))()
assert(loadScript(SCRIPT_HOME.."/MSP/common.lua"))()

local MSP_ADD_LAP = 229

local current_screen = 1
local current_item = 0
local is_editing = false

local msp_string = "Msp msg: none"
local debug_string = "debug string!"

local last_cmd = ""

local last_sent = 0
local send_interval = 500

local last_lap = {}
local last_lap_int = 0
local last_lap_ack_needed = 0
local lap_sent = false

local laps_int = {{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0}}

local wifi_status = 0
local connection_status = 0

local CHORUS_CMD_NUM_RX = 1
local CHORUS_CMD_ADC_TYPE = 2
local CHORUS_CMD_ADC_VAL = 3
local CHORUS_CMD_WIFI_PROTO = 4
local CHORUS_CMD_WIFI_CHANNEL = 5
local CHORUS_CMD_FILTER_CUTOFF = 6
local CHORUS_CMD_MIN_LAPTIME = 7
local CHORUS_CMD_SOUNDS = 8
local CHORUS_CMD_SKIP_FIRST = 9
local CHORUS_CMD_RACE_MODE = 10
local chorus_cmds = {}

chorus_cmds[CHORUS_CMD_NUM_RX] =  { cmd="ER*M", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_ADC_TYPE] =  { cmd="ER*v", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_ADC_VAL] =  { cmd="ER*V", bits=16, last_val=nil }
chorus_cmds[CHORUS_CMD_WIFI_PROTO] =  { cmd="ER*w", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_WIFI_CHANNEL] =  { cmd="ER*W", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_FILTER_CUTOFF] =  { cmd="ER*F", bits=16, last_val=nil }
chorus_cmds[CHORUS_CMD_MIN_LAPTIME] =  { cmd="R*M", bits=8, last_val=nil }
chorus_cmds[CHORUS_CMD_SOUNDS] =  { cmd="R*S", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_SKIP_FIRST] =  { cmd="R*1", bits=4, last_val=nil }
chorus_cmds[CHORUS_CMD_RACE_MODE] =  { cmd="R*R", bits=4, last_val=nil }

local settings_labels = {}
local settings_fields = {}

local y = 0
local x = 0
local function inc_y(val)
	y = y + val
	return y
end 

local function inc_x(val)
	x = x + val
	return x
end 
local linespacing = 9
settings_labels[#settings_labels +1] = {t="Num Rx", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="ADC Type", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="ADC Val", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="WiFi Protocol", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="WiFi Channel", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="Filter cutoff", x=x, y=inc_y(linespacing)}
y = 0
x = 70
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 1, max = 6, cmd_id=CHORUS_CMD_NUM_RX}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 0, max = 3, labels={"OFF", "ADC5", "ADC6", "INA219"}, cmd_id=CHORUS_CMD_ADC_TYPE}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 1, max = 10000, cmd_id=CHORUS_CMD_ADC_VAL}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 0, max = 1, labels={"bgn", "b"}, cmd_id=CHORUS_CMD_WIFI_PROTO}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 1, max = 13, cmd_id=CHORUS_CMD_WIFI_CHANNEL}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 1, max = 10000, cmd_id=CHORUS_CMD_FILTER_CUTOFF}
x = 100
y = 0
settings_labels[#settings_labels + 1] = {t="Min Laptime", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="Device Sounds", x=x, y=inc_y(linespacing)}
settings_labels[#settings_labels + 1] = {t="Skip First Lap", x=x, y=inc_y(linespacing)}


y = 0
x= 170
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 0, max = 254, cmd_id=CHORUS_CMD_MIN_LAPTIME}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 0, max = 1, labels={"OFF","ON"}, cmd_id=CHORUS_CMD_SOUNDS}
settings_fields[#settings_fields + 1] = {x= x, y=inc_y(linespacing), min = 0, max = 1, labels={"OFF","ON"}, cmd_id=CHORUS_CMD_SKIP_FIRST}


local settings_page = { title = "Chorus32 Settings", labels=settings_labels, fields=settings_fields}

local race_labels = {}

local function chorus_get_value(cmd_id)
	serialWrite(chorus_cmds[cmd_id].cmd .. "\n")
end

local function chorus_set_value(cmd_id, value)
	serialWrite(chorus_cmds[cmd_id].cmd .. string.format("%0" .. math.floor(chorus_cmds[cmd_id].bits/4) .. "X\n", value))
end

local function ms_to_string(ms)
	local seconds = ms/1000
	local minutes = math.floor(seconds/60)
	seconds = seconds % 60
	return  (string.format("%02d:%05.2f", minutes, seconds))
end

local function draw_debug_screen()
	lcd.drawScreenTitle("Racing", 1, 2)
	lcd.drawText(0, 11, "WiFi status:", 0)
	lcd.drawText(lcd.getLastPos()+2, 11, wifi_status,0)
	lcd.drawText(lcd.getLastPos()+2, 11, ms_to_string(last_lap_int),0)
	lcd.drawText(0, 21, "Connection status:", 0)
	lcd.drawText(lcd.getLastPos()+2, 21, connection_status,0)
	lcd.drawText(0, 31, "Last rx: ",0)
	lcd.drawText(lcd.getLastPos()+2, 31, last_cmd,0)
	lcd.drawText(0, 41, msp_string,0)
	lcd.drawText(0, 51, debug_string,0)
end

local function draw_race_screen()
	local race_status = chorus_cmds[CHORUS_CMD_RACE_MODE].last_val
	if race_status == nil then
		chorus_get_value(CHORUS_CMD_RACE_MODE)
	end
	lcd.drawScreenTitle("Racing Status: " .. tostring(race_status), 1, 1)
	local textopt = SMLSIZE;
	local y_offset = 8
	linespacing = 9
	y = y_offset
	x = 0
	lcd.drawText(x, y, "Laps", textopt)
	for i=1,5 do
		lcd.drawLine(0, inc_y(linespacing), 212, y, SOLID, 0)
			lcd.drawText(x+2, y+2, "Pilot " .. i, textopt)
	end
	local x_spacing = 40
	x = 0
	y = y_offset
	for i=1,4 do
		lcd.drawLine(inc_x(x_spacing), y_offset, x, 64, SOLID, 0)
		lcd.drawText(x+2, y+2, i, textopt)
	end
	
	for i=1,#laps_int do
		for j=1, #(laps_int[i]) do
			if laps_int[i][j] ~= 0 then
				lcd.drawText(x_spacing*j+2, y_offset + linespacing*i+2, ms_to_string(laps_int[i][j]), textopt)
			end
		end
	end
end

local race_page = {custom_draw_func=draw_race_screen}
local debug_page = { custom_draw_func=draw_debug_screen }
local pages = {race_page, debug_page, settings_page}

local last_chorus_update = 0


local function process_msp_reply(cmd,rx_buf)
	if cmd == MSP_ADD_LAP then
		-- TODO: any way to match with id?
		last_lap_ack_needed = last_lap_ack_needed - 1
	end
end

local function get_connection_status()
	serialWrite("PR*w\n")
	serialWrite("PR*c\n")
end

local busy_count = 0
local function send_msp(values)
	mspProcessTxQ()
	if protocol.mspWrite(MSP_ADD_LAP, values) == nil then
		busy_count = busy_count + 1
		debug_string = "MSP busy!" .. tostring(busy_count)
	end
	mspProcessTxQ()
	--process_msp_reply(mspPollReply())
end

local function convert_lap(pilot, lap, laptime)
	msp_string = "Last lap " .. pilot .. "L" .. lap .. "T" .. laptime
	local values = {}
	values[1] = pilot
	values[2] = lap
	for i = 3, 6 do
		values[i] = bit32.band(laptime, 0xFF)
		laptime = bit32.rshift(laptime, 8)
	end
	return values
end


local function process_extended_cmd(cmd)
	local node = string.sub(cmd, 2,2)
	local chorus_cmd = string.sub(cmd, 3,3)
	for i=1,#chorus_cmds do
		if string.sub(chorus_cmds[i].cmd, 1, 1) == "E" and string.sub(chorus_cmds[i].cmd, 4, 4) == chorus_cmd then
			chorus_cmds[i].last_val = tonumber(string.sub(cmd, 4), 16)
		end
	end
end

local function process_proxy_cmd(cmd)
	local chorus_cmd = string.sub(cmd, 3,3)
	if(chorus_cmd == "w") then
		wifi_status = tonumber(string.sub(cmd, 4), 16)
	elseif (chorus_cmd == 'c') then
		connection_status = tonumber(string.sub(cmd, 4), 16)
	end

end

local function process_cmd(cmd)
	local type = string.sub(cmd, 1,1)

	if (type == "E") then
		process_extended_cmd(string.sub(cmd, 2))
	elseif (type == "P") then
		process_proxy_cmd(string.sub(cmd, 2))
	else
		local node = tonumber(string.sub(cmd, 2,2))
		local chorus_cmd = string.sub(cmd, 3,3)
		if (chorus_cmd == "L") then -- laptime. for now only for pilot 1
			local new_time = tonumber(string.sub(cmd, 6), 16)
			local lap = tonumber(string.sub(cmd, 4, 5), 16)
			
			if lap < 5 and lap > 0 then -- just limit the number of laps for now
				laps_int[node + 1][lap] = new_time
			end
			if node == 1 then
				last_lap_int = new_time
				last_lap = convert_lap(node, lap, new_time)
				last_lap_ack = false
				lap_sent = false
				last_lap_ack_needed = last_lap_ack_needed + 1
			end
		end
		for i=1,#chorus_cmds do
			if string.sub(chorus_cmds[i].cmd, 3, 3) == chorus_cmd then
				chorus_cmds[i].last_val = tonumber(string.sub(cmd, 4), 16)
			end
		end

	end
end

local function check_setting_pos(setting)
	if setting >= 0 then return setting else return "--" end
end

local function check_blinking(item)
	if current_item == item then
		if is_editing then
			return INVERS+BLINK
		else
			return INVERS
		end
	end
	return 0
end

local function draw_screen()
	local page = pages[current_screen]
	if page.custom_draw_func ~= nil then
		page.custom_draw_func()
		return
	end
	local labels = page.labels
	local fields = page.fields
	lcd.drawScreenTitle(page.title, 2, 2)
	for i=1,#labels do
		lcd.drawText(labels[i].x, labels[i].y, labels[i].t, SMLSIZE)
	end

	for i=1,#fields do
		local val = chorus_cmds[fields[i].cmd_id].last_val
		local field_text = "--"
		if val ~= nil then
			if fields[i].labels ~= nil then -- apply custom labels
				field_text = tostring(fields[i].labels[1 + val - fields[i].min])
			else
				field_text = tostring(val)
			end
		else
			if(getTime() - last_chorus_update > 10) then
				chorus_get_value(fields[i].cmd_id)
				last_chorus_update = getTime()
			end
		end
		lcd.drawText(fields[i].x, fields[i].y, field_text, check_blinking(i) + SMLSIZE)
	end
end


local function draw_ui()
	lcd.clear()

	draw_screen()
end

local function handle_input_edit(event)
	if current_screen == PAGE_SETTINGS then
		local setting = settings_fields[current_item]
		local current_val = chorus_cmds[setting.cmd_id].last_val
		if event == EVT_PLUS_BREAK then
			if current_val + 1 <= setting.max then
				chorus_set_value(setting.cmd_id, current_val + 1)
			end
		elseif event == EVT_MINUS_BREAK then
			if current_val > setting.min then
				chorus_set_value(setting.cmd_id, current_val - 1)
			end
		end
	end

end

local function handle_input(event)
	if(event == EVT_ENTER_BREAK) then
		is_editing = not is_editing
	end
	if is_editing then
		handle_input_edit(event)
	elseif(event == EVT_PAGE_BREAK) then
		current_item = 1
		current_screen = (current_screen + 1)
		if current_screen > #(pages) then
			current_screen = 1
		end
	elseif pages[current_screen].fields ~= nil then
		if(event == EVT_MINUS_BREAK) then
			current_item = current_item + 1
			if(current_item > #(pages[current_screen].fields)) then
				current_item = 1
			end
		elseif(event == EVT_PLUS_BREAK) then
			current_item = current_item - 1
			if(current_item < 0) then
				current_item = #(pages[current_screen].fields)
			end
		end
	elseif event == EVT_MENU_BREAK then
		if chorus_cmds[CHORUS_CMD_RACE_MODE].last_val == 0 then
			chorus_set_value(CHORUS_CMD_RACE_MODE, 1)
		else
			chorus_set_value(CHORUS_CMD_RACE_MODE, 0)
		end
	end

end

local function run_bg()
	mspProcessTxQ()
	return 0
end

local run = function (event)
	handle_input(event)
	draw_ui()
	--if type(serialReadLine) == "function" then
	--local rx = serialReadLine()
	--end
	if(rx ~= nil) then
		last_cmd = rx
		process_cmd(last_cmd)
	end

	if(last_sent + send_interval < getTime()) then
		last_sent = getTime()
		get_connection_status()
	end
	mspProcessTxQ()
	if last_lap_int ~= 0 then
		if lap_sent == false then
			if protocol.mspWrite(MSP_ADD_LAP, last_lap) ~= nil then
				lap_sent = true
				debug_string = "Lap sent!"
			else
				debug_string = "MSP is busy"
			end
		end
	end
	return 0
end

return {run=run, run_bg=run_bg}
