// weather.json holds {"name": ..., "latitude": ..., "longitude": ...} (see
// omarchy-weather-location, which owns the format). Missing, blank, or
// unparseable means the location is auto-detected from the IP address.
function parseLocationFile(raw) {
  var unset = { name: "", latitude: null, longitude: null }
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return unset

    var latitude = parseFloat(data.latitude)
    var longitude = parseFloat(data.longitude)
    var hasCoordinates = !isNaN(latitude) && !isNaN(longitude)
    return {
      name: typeof data.name === "string" ? data.name.replace(/^\s+|\s+$/g, "") : "",
      latitude: hasCoordinates ? latitude : null,
      longitude: hasCoordinates ? longitude : null
    }
  } catch (e) {
    return unset
  }
}

// wttr.in path segment for a configured location: exact coordinates when
// both are present, the URL-encoded name as a fallback (hand-edited
// weather.loc files may only carry a name), empty for IP auto-detect.
function wttrLocationQuery(location, latitude, longitude) {
  var lat = parseFloat(String(latitude))
  var lon = parseFloat(String(longitude))
  if (!isNaN(lat) && !isNaN(lon)) return lat + "," + lon

  var name = String(location || "").replace(/^\s+|\s+$/g, "")
  return name === "" ? "" : encodeURIComponent(name)
}

// Remote weather, forecast, geocoding, and location bodies are collected in
// full by StdioCollector. curl --max-filesize stops the producer at 1 MiB
// (1048576 bytes) — real payloads are kilobytes (a wttr.in j1 document is
// about 40 KiB) — and a body that reaches that ceiling is truncated, so it
// is refused before JSON.parse. The tighter caps below bound what is copied
// into QML models after a successful parse.
var maxResponseChars = 1048576
var maxLocationChars = 200
var maxGeocodeResults = 8
var maxGeocodeNameChars = 120
var maxGeocodeDescriptionChars = 180
var maxForecastDays = 8
var maxHourlyPoints = 192
var maxWttrHoursPerDay = 24
var maxConditionSlots = 4
var maxJsonStringChars = 1024
var maxJsonDepth = 12
var maxJsonKeys = 128
var maxJsonArray = 192

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

// Empty, at-cap, and cut-off bodies are not parsed. A complete JSON object
// is the only shape these endpoints return; anything else is partial.
function remoteJsonText(raw) {
  var text = String(raw === undefined || raw === null ? "" : raw)
  if (text.length === 0 || text.length >= maxResponseChars) return ""
  var trimmed = text.replace(/^\s+|\s+$/g, "")
  if (!trimmed || trimmed.length >= maxResponseChars) return ""
  if (trimmed.charAt(0) !== "{" || trimmed.charAt(trimmed.length - 1) !== "}") return ""
  return trimmed
}

function jsonStructureWithinCaps(value, depth) {
  if (value === null || value === undefined) return true
  var kind = typeof value
  if (kind === "string") return value.length <= maxJsonStringChars
  if (kind === "number") return isFinite(value)
  if (kind === "boolean") return true
  if (kind !== "object") return false
  if (depth > maxJsonDepth) return false
  if (Array.isArray(value)) {
    if (value.length > maxJsonArray) return false
    for (var i = 0; i < value.length; i++) {
      if (!jsonStructureWithinCaps(value[i], depth + 1)) return false
    }
    return true
  }
  var keys = Object.keys(value)
  if (keys.length > maxJsonKeys) return false
  for (var k = 0; k < keys.length; k++) {
    if (keys[k].length > maxJsonStringChars) return false
    if (!jsonStructureWithinCaps(value[keys[k]], depth + 1)) return false
  }
  return true
}

function parseRemoteJson(raw) {
  var text = remoteJsonText(raw)
  if (!text) return null
  var data
  try {
    data = JSON.parse(text)
  } catch (e) {
    return null
  }
  if (!isPlainObject(data) || !jsonStructureWithinCaps(data, 0)) return null
  return data
}

function arrayWithin(value, maxLen) {
  if (value === undefined || value === null) return true
  return Array.isArray(value) && value.length <= maxLen
}

function wttrReportWithinCaps(data) {
  if (!isPlainObject(data)) return false
  if (!arrayWithin(data.current_condition, maxConditionSlots)) return false
  if (!arrayWithin(data.nearest_area, maxConditionSlots)) return false
  if (!arrayWithin(data.weather, maxForecastDays)) return false
  var days = data.weather || []
  for (var i = 0; i < days.length; i++) {
    var day = days[i]
    if (!isPlainObject(day)) return false
    if (!arrayWithin(day.hourly, maxWttrHoursPerDay)) return false
  }
  return true
}

function openMeteoReportWithinCaps(data) {
  if (!isPlainObject(data)) return false
  var daily = data.daily
  if (daily !== undefined && daily !== null) {
    if (!isPlainObject(daily)) return false
    if (!arrayWithin(daily.time, maxForecastDays)) return false
    if (!arrayWithin(daily.weather_code, maxForecastDays)) return false
    if (!arrayWithin(daily.temperature_2m_max, maxForecastDays)) return false
    if (!arrayWithin(daily.temperature_2m_min, maxForecastDays)) return false
    if (!arrayWithin(daily.sunrise, maxForecastDays)) return false
    if (!arrayWithin(daily.sunset, maxForecastDays)) return false
  }
  var hourly = data.hourly
  if (hourly !== undefined && hourly !== null) {
    if (!isPlainObject(hourly)) return false
    if (!arrayWithin(hourly.time, maxHourlyPoints)) return false
    if (!arrayWithin(hourly.uv_index, maxHourlyPoints)) return false
    if (!arrayWithin(hourly.precipitation, maxHourlyPoints)) return false
    if (!arrayWithin(hourly.precipitation_probability, maxHourlyPoints)) return false
    if (!arrayWithin(hourly.weather_code, maxHourlyPoints)) return false
    if (!arrayWithin(hourly.rain, maxHourlyPoints)) return false
  }
  return true
}

function parseWttrReport(raw) {
  var data = parseRemoteJson(raw)
  if (!data || !wttrReportWithinCaps(data)) return null
  return data
}

function parseOpenMeteoReport(raw) {
  var data = parseRemoteJson(raw)
  if (!data || !openMeteoReportWithinCaps(data)) return null
  return data
}

// wttr.in ?format=%l is a short "City, Region, Country" line. Refuse empty,
// over-long, and multi-line bodies before they reach the location label.
function boundedLocationLabel(raw) {
  var text = String(raw === undefined || raw === null ? "" : raw)
  if (text.length === 0 || text.length > maxLocationChars || text.length >= maxResponseChars) return ""
  var trimmed = text.replace(/^\s+|\s+$/g, "")
  if (!trimmed || trimmed.length > maxLocationChars) return ""
  if (trimmed.indexOf("\n") !== -1 || trimmed.indexOf("\r") !== -1) return ""
  var city = trimmed.split(",")[0].replace(/^\s+|\s+$/g, "")
  if (!city || city.length > maxLocationChars) return ""
  return city
}

// Open-Meteo geocoding response → suggestion rows for the location picker.
function parseGeocodingResults(raw) {
  var data = parseRemoteJson(raw)
  if (!data) return []
  var results = data.results
  if (!results || !results.length || !Array.isArray(results)) return []

  var out = []
  var limit = results.length < maxGeocodeResults ? results.length : maxGeocodeResults
  for (var i = 0; i < limit; i++) {
    var r = results[i]
    if (!r || !r.name || r.latitude === undefined || r.longitude === undefined) continue
    var name = String(r.name)
    if (!name || name.length > maxGeocodeNameChars) continue
    var latitude = Number(r.latitude)
    var longitude = Number(r.longitude)
    if (!isFinite(latitude) || !isFinite(longitude)) continue
    var region = [r.admin1, r.country].filter(function(part) { return !!part }).join(", ")
    if (region.length > maxGeocodeDescriptionChars) region = region.slice(0, maxGeocodeDescriptionChars)
    out.push({
      name: name,
      description: region,
      latitude: latitude,
      longitude: longitude
    })
  }
  return out
}

function locationCommit(text, suggestions, selectedIndex) {
  var name = String(text || "").replace(/^\s+|\s+$/g, "")
  if (name === "") return { name: "", latitude: null, longitude: null }

  var choices = suggestions || []
  var index = Math.max(0, Math.min(parseInt(selectedIndex, 10) || 0, choices.length - 1))
  var suggestion = choices[index]
  if (suggestion) return suggestion

  return { name: name, latitude: null, longitude: null }
}

function isFutureForecastDate(dateString, todayString) {
  if (!dateString) return false
  return String(dateString).slice(0, 10) > String(todayString || "")
}

function roundedTemp(value) {
  if (value === undefined || value === null || value === "") return ""
  var n = parseFloat(String(value))
  return isNaN(n) ? "" : String(Math.round(n))
}

function celsiusToFahrenheit(value) {
  if (value === undefined || value === null || value === "") return ""
  var n = parseFloat(String(value))
  return isNaN(n) ? "" : (n * 9 / 5) + 32
}

function formatTemp(value, useImperial) {
  if (value === undefined || value === null || value === "") return ""
  return value + "°" + (useImperial ? "F" : "C")
}

function normalizedUnit(value) {
  return String(value || "").replace(/^\s+|\s+$/g, "").toLowerCase()
}

function localeUsesImperial(localeName) {
  var name = String(localeName || "").replace(".", "_")
  return /^en[_-]US($|[_.-])/.test(name) || /^en[_-]LR($|[_.-])/.test(name) || /^my($|[_.-])/.test(name)
}

function countryUsesImperial(countryName) {
  var country = String(countryName || "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/[._-]+/g, " ")
    .toLowerCase()
  if (!country) return null
  if (country === "us" || country === "usa" || country === "united states" || country === "united states of america") return true
  if (country === "liberia" || country === "myanmar" || country === "burma") return true
  return false
}

function shouldUseImperial(unitOverride, localeName, countryName) {
  var unit = normalizedUnit(unitOverride)
  if (unit === "imperial") return true
  if (unit === "metric") return false

  var countryPreference = countryUsesImperial(countryName)
  if (countryPreference !== null) return countryPreference

  return localeUsesImperial(localeName)
}

function dayName(dateString, formatter) {
  if (!dateString) return ""
  var d = new Date(dateString + "T12:00:00")
  if (isNaN(d.getTime())) return ""
  if (formatter) return formatter(d)
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()]
}

// Upcoming days shown under the popup, not counting today.
var upcomingForecastDays = 5

function openMeteoForecastDays(dailyForecastReport, todayString) {
  var daily = dailyForecastReport && dailyForecastReport.daily ? dailyForecastReport.daily : null
  if (!daily || !daily.time) return []

  var result = []
  for (var i = 0; i < daily.time.length && result.length < upcomingForecastDays; ++i) {
    var date = daily.time[i]
    if (!isFutureForecastDate(date, todayString)) continue

    var maxC = daily.temperature_2m_max ? daily.temperature_2m_max[i] : ""
    var minC = daily.temperature_2m_min ? daily.temperature_2m_min[i] : ""
    result.push({
      date: date,
      maxtempC: roundedTemp(maxC),
      mintempC: roundedTemp(minC),
      maxtempF: roundedTemp(celsiusToFahrenheit(maxC)),
      mintempF: roundedTemp(celsiusToFahrenheit(minC)),
      openMeteoWeatherCode: daily.weather_code ? daily.weather_code[i] : null
    })
  }
  return result
}

// Open-Meteo bundles current conditions with the daily forecast request and
// answers far faster than wttr.in. Normalize them to wttr's
// current_condition shape so the panel can use either source
// interchangeably. Open-Meteo reports metric (°C, km/h).
function openMeteoCurrentCondition(dailyForecastReport) {
  var current = dailyForecastReport && dailyForecastReport.current ? dailyForecastReport.current : null
  if (!current || current.temperature_2m === undefined || current.temperature_2m === null) return null
  return {
    temp_C: roundedTemp(current.temperature_2m),
    temp_F: roundedTemp(celsiusToFahrenheit(current.temperature_2m)),
    FeelsLikeC: roundedTemp(current.apparent_temperature),
    FeelsLikeF: roundedTemp(celsiusToFahrenheit(current.apparent_temperature)),
    windspeedKmph: roundedTemp(current.wind_speed_10m),
    windspeedMiles: roundedTemp(current.wind_speed_10m * 0.621371),
    humidity: roundedTemp(current.relative_humidity_2m),
    uvIndex: formatUv(current.uv_index),
    precipitation: current.precipitation,
    rain: current.rain,
    openMeteoWeatherCode: current.weather_code,
    isDay: current.is_day
  }
}

function parseUv(value) {
  if (value === undefined || value === null || value === "") return null
  var n = parseFloat(String(value))
  return isNaN(n) ? null : n
}

function formatUv(value) {
  var n = parseUv(value)
  if (n === null) return ""
  return String(Math.round(n))
}

function formatBarUv(value) {
  var n = formatUv(value)
  return n === "" ? "" : ("UV " + n)
}

// Open-Meteo `timezone=auto` returns wall time with no offset ("2026-09-21T06:42").
function parseLocalIso(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(iso || ""))
  if (!m) return null
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
  return isNaN(d.getTime()) ? null : d
}

function formatSunTime(date, compact) {
  if (!date || isNaN(date.getTime())) return ""
  var h = date.getHours()
  var min = date.getMinutes()
  var h12 = h % 12
  if (h12 === 0) h12 = 12
  var mm = (min < 10 ? "0" : "") + min
  if (compact === false) return h12 + ":" + mm + (h >= 12 ? " PM" : " AM")
  return h12 + ":" + mm + (h >= 12 ? "p" : "a")
}

// Today's pair until sunset, then tomorrow's. The bar shows only `label`
// (the next sunrise or sunset). The popup still uses both full times.
function barSunClock(dailyForecastReport, now) {
  var empty = { visible: false, sunrise: "", sunset: "", sunriseFull: "", sunsetFull: "", next: "", label: "" }
  var daily = dailyForecastReport && dailyForecastReport.daily ? dailyForecastReport.daily : null
  if (!daily || !daily.sunrise || !daily.sunset) return empty

  var events = []
  var count = Math.min(daily.sunrise.length, daily.sunset.length)
  for (var i = 0; i < count; i++) {
    var up = parseLocalIso(daily.sunrise[i])
    var down = parseLocalIso(daily.sunset[i])
    if (up) events.push({ kind: "sunrise", at: up })
    if (down) events.push({ kind: "sunset", at: down })
  }
  events.sort(function(a, b) { return a.at.getTime() - b.at.getTime() })
  if (!events.length) return empty

  // QML dates cross the import boundary, so instanceof Date is not reliable.
  var moment = (now && typeof now.getTime === "function") ? now : new Date(now)
  var t = moment.getTime()
  if (isNaN(t)) return empty

  var next = null
  for (var j = 0; j < events.length; j++) {
    if (events[j].at.getTime() > t) {
      next = events[j]
      break
    }
  }
  if (!next) return empty

  var sunrise = null
  var sunset = null
  if (next.kind === "sunrise") {
    sunrise = next.at
    for (var k = 0; k < events.length; k++) {
      if (events[k].kind === "sunset" && events[k].at.getTime() > next.at.getTime()) {
        sunset = events[k].at
        break
      }
    }
  } else {
    sunset = next.at
    for (var k2 = events.length - 1; k2 >= 0; k2--) {
      if (events[k2].kind === "sunrise" && events[k2].at.getTime() < next.at.getTime()) {
        sunrise = events[k2].at
        break
      }
    }
  }
  if (!sunrise || !sunset) return empty

  return {
    visible: true,
    sunrise: formatSunTime(sunrise),
    sunset: formatSunTime(sunset),
    sunriseFull: formatSunTime(sunrise, false),
    sunsetFull: formatSunTime(sunset, false),
    next: next.kind,
    label: (next.kind === "sunrise" ? "↑ " : "↓ ") + formatSunTime(next.at)
  }
}

// Daytime UV on the bar; hide at night and when the index rounds to 0 so
// dawn/dusk do not leave a leftover "UV 0".
function barShowsUv(current, uvValue) {
  var uv = parseUv(uvValue)
  if (uv === null || Math.round(uv) < 1) return false
  if (current && current.isDay !== undefined && current.isDay !== null && current.isDay !== "")
    return Number(current.isDay) === 1
  return true
}

function parseMm(value) {
  var n = parseUv(value)
  return n === null ? 0 : n
}

// Open-Meteo rain/drizzle/freezing-rain/showers/thunder. Snow is out of
// scope for the rain chip.
function isRainWeatherCode(code) {
  var c = parseInt(String(code), 10)
  if (isNaN(c)) return false
  if (c >= 51 && c <= 67) return true
  if (c >= 80 && c <= 82) return true
  if (c >= 95 && c <= 99) return true
  return false
}

function isCurrentlyRaining(current) {
  if (!current) return false
  if (isRainWeatherCode(current.openMeteoWeatherCode) || isRainWeatherCode(current.weatherCode))
    return true
  return parseMm(current.precipitation) >= 0.1
    || parseMm(current.rain) >= 0.1
    || parseMm(current.precipMM) >= 0.1
}

function openMeteoHourlyPrecip(dailyForecastReport) {
  var hourly = dailyForecastReport && dailyForecastReport.hourly ? dailyForecastReport.hourly : null
  if (!hourly || !hourly.time) return []

  var out = []
  var limit = hourly.time.length < maxHourlyPoints ? hourly.time.length : maxHourlyPoints
  for (var i = 0; i < limit; i++) {
    var stamp = String(hourly.time[i] || "")
    if (stamp.length > maxJsonStringChars) continue
    out.push({
      time: stamp,
      precipitation: hourly.precipitation ? parseMm(hourly.precipitation[i]) : 0,
      rain: hourly.rain ? parseMm(hourly.rain[i]) : 0,
      probability: hourly.precipitation_probability ? parseUv(hourly.precipitation_probability[i]) : null,
      weatherCode: hourly.weather_code ? hourly.weather_code[i] : null
    })
  }
  return out
}

function isRainyHour(hour) {
  if (!hour) return false
  if (isRainWeatherCode(hour.weatherCode)) return true
  if (hour.precipitation >= 0.2 || hour.rain >= 0.2) return true
  if (hour.probability !== null && hour.probability >= 50) return true
  return false
}

// Open-Meteo hourly stamps are local wall time without a zone suffix.
function hourDelta(stamp, now) {
  var raw = String(stamp || "")
  if (raw.length < 13) return null
  var y = parseInt(raw.slice(0, 4), 10)
  var mo = parseInt(raw.slice(5, 7), 10) - 1
  var d = parseInt(raw.slice(8, 10), 10)
  var h = parseInt(raw.slice(11, 13), 10)
  var mi = parseInt(raw.slice(14, 16), 10)
  if (isNaN(mi)) mi = 0
  if (isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h)) return null
  var t = new Date(y, mo, d, h, mi, 0, 0)
  var n = now instanceof Date ? now : new Date(now)
  if (isNaN(t.getTime()) || isNaN(n.getTime())) return null
  return (t.getTime() - n.getTime()) / 3600000
}

function formatRainEta(hours) {
  var h = Number(hours)
  if (!isFinite(h) || h < 1.5) return "RAIN 1h"
  return "RAIN " + String(Math.round(h)) + "h"
}

function barRainReadout(current, hourly, now, horizonHours) {
  var hidden = { visible: false, label: "" }
  var horizon = Number(horizonHours)
  if (!isFinite(horizon) || horizon <= 0) horizon = 8

  if (isCurrentlyRaining(current))
    return { visible: true, label: "RAIN" }

  var hours = hourly || []
  var soonDelta = Infinity
  for (var i = 0; i < hours.length; i++) {
    if (!isRainyHour(hours[i])) continue
    var delta = hourDelta(hours[i].time, now)
    if (delta === null) continue
    if (delta < -0.5) continue
    if (delta < 0.35) return { visible: true, label: "RAIN" }
    if (delta <= horizon && delta < soonDelta) soonDelta = delta
  }
  if (!isFinite(soonDelta) || soonDelta === Infinity) return hidden
  return { visible: true, label: formatRainEta(soonDelta) }
}

function openMeteoTodayHourlyUv(dailyForecastReport, todayString) {
  var hourly = dailyForecastReport && dailyForecastReport.hourly ? dailyForecastReport.hourly : null
  if (!hourly || !hourly.time || !hourly.uv_index) return []

  var today = String(todayString || "").slice(0, 10)
  if (!today) return []

  var out = []
  var limit = hourly.time.length < maxHourlyPoints ? hourly.time.length : maxHourlyPoints
  for (var i = 0; i < limit && out.length < 24; i++) {
    var stamp = String(hourly.time[i] || "")
    if (stamp.length > maxJsonStringChars) continue
    if (stamp.slice(0, 10) !== today) continue
    var hour = parseInt(stamp.slice(11, 13), 10)
    if (isNaN(hour)) continue
    var uv = parseUv(hourly.uv_index[i])
    out.push({ hour: hour, uv: uv === null ? 0 : Math.max(0, uv) })
  }
  return out
}

function uvSeriesMax(series) {
  var max = 0
  if (!series) return max
  for (var i = 0; i < series.length; i++) {
    if (series[i] && series[i].uv > max) max = series[i].uv
  }
  return max
}

function uvAtHour(series, hourFloat) {
  if (!series || series.length === 0) return 0
  var h = Number(hourFloat)
  if (!isFinite(h)) h = 0
  if (h <= series[0].hour) return series[0].uv

  var last = series[series.length - 1]
  if (h >= last.hour) return last.uv

  for (var i = 1; i < series.length; i++) {
    var b = series[i]
    if (h > b.hour) continue
    var a = series[i - 1]
    var span = b.hour - a.hour
    var t = span === 0 ? 0 : (h - a.hour) / span
    return a.uv + (b.uv - a.uv) * t
  }
  return last.uv
}

function uvChartLayout(series, nowHour, width, height, pad) {
  var empty = { bars: [], segs: [], nowX: 0, nowY: 0, hasNow: false }
  pad = Number(pad)
  if (!isFinite(pad) || pad < 0) pad = 5
  width = Number(width)
  height = Number(height)
  if (!series || series.length < 2 || !isFinite(width) || !isFinite(height)) return empty
  if (width <= pad * 2 || height <= pad * 2) return empty

  var plotW = width - pad * 2
  var plotH = height - pad * 2
  var maxUv = Math.max(uvSeriesMax(series), 1)

  function xFor(hour) {
    return pad + (hour / 24) * plotW
  }
  function yFor(uv) {
    return pad + (1 - uv / maxUv) * plotH
  }

  var bars = []
  var barW = Math.max(1, plotW / 24)
  for (var hour = 0; hour < 24; hour++) {
    var uv = uvAtHour(series, hour + 0.5)
    var barH = (uv / maxUv) * plotH
    bars.push({
      x: xFor(hour),
      y: pad + plotH - barH,
      w: barW,
      h: Math.max(0, barH)
    })
  }

  var segs = []
  for (var i = 1; i < series.length; i++) {
    var x1 = xFor(series[i - 1].hour)
    var y1 = yFor(series[i - 1].uv)
    var x2 = xFor(series[i].hour)
    var y2 = yFor(series[i].uv)
    var dx = x2 - x1
    var dy = y2 - y1
    segs.push({
      x: x1,
      y: y1,
      length: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx) * 180 / Math.PI
    })
  }

  var now = Number(nowHour)
  if (!isFinite(now)) now = 0
  now = Math.max(0, Math.min(24, now))

  return {
    bars: bars,
    segs: segs,
    nowX: xFor(now),
    nowY: yFor(uvAtHour(series, now)),
    hasNow: true
  }
}

function currentIcon(current, fallback) {
  if (!current) return fallback || ""
  if (current.openMeteoWeatherCode !== undefined && current.openMeteoWeatherCode !== null)
    return iconForOpenMeteoCode(current.openMeteoWeatherCode, Number(current.isDay) === 0)
  if (current.weatherCode !== undefined && current.weatherCode !== null)
    return iconForCode(current.weatherCode, false)
  return fallback || ""
}

// wttr.in has no day/night flag. Use its icon only to fill an empty initial
// state, never to replace a day/night-aware icon resolved by Open-Meteo.
function provisionalCurrentIcon(current, resolvedIcon) {
  return resolvedIcon || currentIcon(current, "")
}

function weatherResponseCompletesSave(hasConfiguredCoordinates, source) {
  return hasConfiguredCoordinates ? source === "open-meteo" : source === "wttr"
}

function wttrNextForecastDays(report, todayString) {
  var days = report && report.weather ? report.weather : []
  var result = []
  for (var i = 0; i < days.length && result.length < upcomingForecastDays; ++i) {
    if (isFutureForecastDate(days[i].date, todayString)) result.push(days[i])
  }
  return result
}

function buildForecastDays(report, dailyForecastReport, todayString) {
  var days = openMeteoForecastDays(dailyForecastReport, todayString)
  return days.length > 0 ? days : wttrNextForecastDays(report, todayString)
}

function bareTempForDay(day, kind, useImperial) {
  if (!day) return ""
  var v = useImperial
    ? (kind === "max" ? day.maxtempF : day.mintempF)
    : (kind === "max" ? day.maxtempC : day.mintempC)
  if (v === undefined || v === null || v === "") return ""
  return v + "°"
}

function dayIcon(day) {
  if (!day) return ""
  if (day.openMeteoWeatherCode !== undefined && day.openMeteoWeatherCode !== null)
    return iconForOpenMeteoCode(day.openMeteoWeatherCode)
  if (!day.hourly || day.hourly.length === 0) return ""

  var best = day.hourly[0]
  var bestDist = 9999
  for (var i = 0; i < day.hourly.length; ++i) {
    var t = parseInt(String(day.hourly[i].time || "0"), 10)
    var dist = Math.abs(t - 1200)
    if (dist < bestDist) {
      bestDist = dist
      best = day.hourly[i]
    }
  }
  return iconForCode(best.weatherCode, false)
}

function iconForOpenMeteoCode(code, night) {
  var c = parseInt(String(code || "0"), 10)
  if (c === 0) return iconForCode(113, night)
  if (c === 1 || c === 2) return iconForCode(116, night)
  if (c === 3) return iconForCode(119, night)
  if (c === 45 || c === 48) return iconForCode(143, night)
  if (c === 51 || c === 53 || c === 55 || c === 56 || c === 57 || c === 61) return iconForCode(266, night)
  if (c === 63 || c === 65 || c === 66 || c === 67 || c === 80 || c === 81 || c === 82) return iconForCode(308, night)
  if (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return iconForCode(338, night)
  if (c === 95 || c === 96 || c === 99) return iconForCode(389, night)
  return iconForCode(119, night)
}

function iconForCode(code, night) {
  var c = parseInt(String(code || "0"), 10)
  switch (c) {
    case 113: return night ? "" : ""
    case 116: return night ? "" : ""
    case 119: case 122: return ""
    case 143: case 248: case 260: return night ? "\ue346" : "\ue313"
    case 176: case 263: case 353: return night ? "" : ""
    case 179: case 227: case 230: case 323: case 326: case 368: return night ? "" : ""
    case 182: case 185: case 281: case 284: case 311: case 314:
    case 317: case 320: case 350: case 362: case 365: case 374: case 377: return ""
    case 200: case 386: case 389: case 392: case 395: return ""
    case 266: case 293: case 296: case 299: case 302: case 305: case 308: case 356: case 359: return ""
    case 329: case 332: case 335: case 338: case 371: return ""
    default: return ""
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    parseLocationFile: parseLocationFile,
    wttrLocationQuery: wttrLocationQuery,
    maxResponseChars: maxResponseChars,
    maxLocationChars: maxLocationChars,
    maxGeocodeResults: maxGeocodeResults,
    maxForecastDays: maxForecastDays,
    maxHourlyPoints: maxHourlyPoints,
    maxWttrHoursPerDay: maxWttrHoursPerDay,
    maxJsonStringChars: maxJsonStringChars,
    maxJsonArray: maxJsonArray,
    remoteJsonText: remoteJsonText,
    parseRemoteJson: parseRemoteJson,
    parseWttrReport: parseWttrReport,
    parseOpenMeteoReport: parseOpenMeteoReport,
    boundedLocationLabel: boundedLocationLabel,
    parseGeocodingResults: parseGeocodingResults,
    locationCommit: locationCommit,
    isFutureForecastDate: isFutureForecastDate,
    roundedTemp: roundedTemp,
    celsiusToFahrenheit: celsiusToFahrenheit,
    formatTemp: formatTemp,
    normalizedUnit: normalizedUnit,
    localeUsesImperial: localeUsesImperial,
    countryUsesImperial: countryUsesImperial,
    shouldUseImperial: shouldUseImperial,
    dayName: dayName,
    openMeteoForecastDays: openMeteoForecastDays,
    openMeteoCurrentCondition: openMeteoCurrentCondition,
    parseUv: parseUv,
    formatUv: formatUv,
    formatBarUv: formatBarUv,
    parseLocalIso: parseLocalIso,
    formatSunTime: formatSunTime,
    barSunClock: barSunClock,
    barShowsUv: barShowsUv,
    parseMm: parseMm,
    isRainWeatherCode: isRainWeatherCode,
    isCurrentlyRaining: isCurrentlyRaining,
    openMeteoHourlyPrecip: openMeteoHourlyPrecip,
    isRainyHour: isRainyHour,
    hourDelta: hourDelta,
    formatRainEta: formatRainEta,
    barRainReadout: barRainReadout,
    openMeteoTodayHourlyUv: openMeteoTodayHourlyUv,
    uvSeriesMax: uvSeriesMax,
    uvAtHour: uvAtHour,
    uvChartLayout: uvChartLayout,
    currentIcon: currentIcon,
    provisionalCurrentIcon: provisionalCurrentIcon,
    weatherResponseCompletesSave: weatherResponseCompletesSave,
    wttrNextForecastDays: wttrNextForecastDays,
    buildForecastDays: buildForecastDays,
    bareTempForDay: bareTempForDay,
    dayIcon: dayIcon,
    iconForOpenMeteoCode: iconForOpenMeteoCode,
    iconForCode: iconForCode
  }
}
