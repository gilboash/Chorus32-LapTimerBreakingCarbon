SCRIPT_HOME = "/SCRIPTS/BF"
protocol = assert(loadScript(SCRIPT_HOME.."/protocols.lua"))()

assert(loadScript(protocol.transport))()
assert(loadScript(SCRIPT_HOME.."/MSP/common.lua"))()

local MSP_ADD_LAP = 229
local last_cmd = ""

local last_sent = 0
local send_interval = 500

local last_lap = {}
local last_lap_int = 0

local wifi_status = 0
local connection_status = 0

local function resend_lap()
	protocol.mspWrite(MSP_ADD_LAP, last_lap)
	mspProcessTxQ()
end

local function get_connection_status()
	serialWrite("PR*w\n")
	serialWrite("PR*c\n")
end

local function send_lap(pilot, lap, laptime)
	last_lap_int = laptime
	local values = {}
	values[1] = pilot
	values[2] = lap
	for i = 3, 6 do
		values[i] = bit32.band(laptime, 0xFF)
		laptime = bit32.rshift(laptime, 8)
	end
	last_lap = values

	protocol.mspWrite(MSP_ADD_LAP, values)
	mspProcessTxQ()
end

local function ms_to_string(ms)
	local seconds = ms/1000
	local minutes = math.floor(seconds/60)
	seconds = seconds % 60
	return  (string.format("%02d:%05.2f", minutes, seconds))
end


local function process_extended_cmd(cmd)


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
		local node = string.sub(cmd, 2,2)
		local chorus_cmd = string.sub(cmd, 3,3)
		if (chorus_cmd == "L" and node == "1") then -- laptime. for now only for pilot 1
			local new_time = tonumber(string.sub(cmd, 6), 16)
			local lap = tonumber(string.sub(cmd, 4, 5), 16)
			last_lap = new_time
			send_lap(node, lap, new_time)
		end

	end
end


local run = function ()
	lcd.clear()

	local rx = serialReadLine()
	if(rx ~= nil) then
		last_cmd = rx
		process_cmd(last_cmd)
	end
	lcd.drawText(0, 21, "WiFi status:", 0)
	lcd.drawText(lcd.getLastPos()+2, 21, wifi_status,0)
	lcd.drawText(0, 31, "Connection status:", 0)
	lcd.drawText(lcd.getLastPos()+2, 31, connection_status,0)
	lcd.drawText(0, 41, "Last rx: ",0)
	lcd.drawText(lcd.getLastPos()+2, 41, last_cmd,0)
	lcd.drawText(lcd.getLastPos()+2, 21, ms_to_string(last_lap_int),0)

	if(last_sent + send_interval < getTime()) then
		resend_lap()
		last_sent = getTime()
		get_connection_status()
	end
	return 0
end

return {run=run}
