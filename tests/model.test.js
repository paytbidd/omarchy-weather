const assert = require("assert")
const path = require("path")
const Model = require(path.join(__dirname, "..", "Model.js"))

assert.equal(Model.formatBarUv("6.2"), "UV 6")
assert.equal(Model.formatBarUv(""), "")
assert.equal(Model.barShowsUv({ isDay: 1 }, "6"), true)
assert.equal(Model.barShowsUv({ isDay: 0 }, "6"), false)
assert.equal(Model.barShowsUv({ isDay: 1 }, "0"), false)
assert.equal(Model.barShowsUv({ isDay: 1 }, ""), false)
assert.equal(Model.barShowsUv(null, "6"), true)

assert.equal(Model.isRainWeatherCode(61), true)
assert.equal(Model.isRainWeatherCode(0), false)
assert.equal(Model.isRainWeatherCode(71), false)
assert.equal(Model.isCurrentlyRaining({ openMeteoWeatherCode: 61, precipitation: 0 }), true)
assert.equal(Model.isCurrentlyRaining({ openMeteoWeatherCode: 0, precipitation: 0.4 }), true)
assert.equal(Model.isCurrentlyRaining({ openMeteoWeatherCode: 0, precipitation: 0 }), false)

const now = new Date(2026, 8, 20, 14, 0, 0)

const raining = Model.barRainReadout({ openMeteoWeatherCode: 61, precipitation: 0.4 }, [], now, 8)
assert.equal(raining.visible, true)
assert.equal(raining.label, "RAIN")

const dry = Model.barRainReadout({ openMeteoWeatherCode: 0, precipitation: 0 }, [], now, 8)
assert.equal(dry.visible, false)

const hourlySoon = [
  { time: "2026-09-20T14:00", precipitation: 0, rain: 0, probability: 10, weatherCode: 0 },
  { time: "2026-09-20T16:00", precipitation: 0.5, rain: 0.5, probability: 70, weatherCode: 61 }
]
const soon = Model.barRainReadout({ openMeteoWeatherCode: 0, precipitation: 0 }, hourlySoon, now, 8)
assert.equal(soon.visible, true)
assert.equal(soon.label, "RAIN 2h")

const farHourly = [
  { time: "2026-09-21T04:00", precipitation: 2, rain: 2, probability: 90, weatherCode: 61 }
]
const far = Model.barRainReadout({ openMeteoWeatherCode: 0, precipitation: 0 }, farHourly, now, 8)
assert.equal(far.visible, false)

const thisHour = Model.barRainReadout(
  { openMeteoWeatherCode: 0, precipitation: 0 },
  [{ time: "2026-09-20T14:00", precipitation: 1, rain: 1, probability: 80, weatherCode: 61 }],
  now,
  8
)
assert.equal(thisHour.visible, true)
assert.equal(thisHour.label, "RAIN")

const parsed = Model.openMeteoHourlyPrecip({
  hourly: {
    time: ["2026-09-20T16:00"],
    precipitation: [0.5],
    rain: [0.4],
    precipitation_probability: [70],
    weather_code: [61]
  }
})
assert.equal(parsed.length, 1)
assert.equal(parsed[0].probability, 70)
assert.equal(Model.isRainyHour(parsed[0]), true)

const sunReport = {
  daily: {
    sunrise: ["2026-09-20T06:42", "2026-09-21T06:43", null],
    sunset: ["2026-09-20T19:18", "2026-09-21T19:16", "2026-09-22T19:15"]
  }
}

const beforeRise = Model.barSunClock(sunReport, new Date(2026, 8, 20, 5, 0, 0))
assert.equal(beforeRise.visible, true)
assert.equal(beforeRise.next, "sunrise")
assert.equal(beforeRise.label, "↑ 6:42a")
assert.equal(beforeRise.sunrise, "6:42a")
assert.equal(beforeRise.sunset, "7:18p")
assert.equal(beforeRise.sunriseFull, "6:42 AM")
assert.equal(beforeRise.sunsetFull, "7:18 PM")

const afternoon = Model.barSunClock(sunReport, new Date(2026, 8, 20, 14, 0, 0))
assert.equal(afternoon.next, "sunset")
assert.equal(afternoon.label, "↓ 7:18p")
assert.equal(afternoon.sunrise, "6:42a")
assert.equal(afternoon.sunset, "7:18p")

const atSunset = Model.barSunClock(sunReport, new Date(2026, 8, 20, 19, 18, 0))
assert.equal(atSunset.next, "sunrise")
assert.equal(atSunset.label, "↑ 6:43a")
assert.equal(atSunset.sunrise, "6:43a")
assert.equal(atSunset.sunset, "7:16p")

const noon = new Date(2026, 8, 20, 12, 0, 0)
assert.equal(Model.formatSunTime(noon), "12:00p")
assert.equal(Model.formatSunTime(noon, false), "12:00 PM")
assert.equal(Model.formatSunTime(new Date(2026, 8, 20, 0, 5, 0)), "12:05a")
assert.equal(Model.formatSunTime(new Date(2026, 8, 20, 0, 5, 0), false), "12:05 AM")

assert.equal(Model.barSunClock(null, now).visible, false)
assert.equal(Model.barSunClock({ daily: { sunrise: [null], sunset: [null] } }, now).visible, false)

const week = Model.openMeteoForecastDays({
  daily: {
    time: ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"],
    temperature_2m_max: [20, 21, 22, 23, 24, 25, 26],
    temperature_2m_min: [10, 11, 12, 13, 14, 15, 16],
    weather_code: [0, 1, 2, 3, 45, 51, 61]
  }
}, "2026-09-20")
assert.equal(week.length, 5)
assert.equal(week[0].date, "2026-09-21")
assert.equal(week[4].date, "2026-09-25")
assert.equal(week[0].maxtempC, "21")

assert.equal(Model.maxResponseChars, 1048576)
assert.equal(Model.parseWttrReport(""), null)
assert.equal(Model.parseWttrReport("{\"current_condition\":["), null)
assert.equal(Model.parseOpenMeteoReport("a".repeat(Model.maxResponseChars)), null)
assert.equal(Model.remoteJsonText("{" + "a".repeat(Model.maxResponseChars) + "}"), "")

const smallWttr = Model.parseWttrReport(JSON.stringify({
  current_condition: [{ temp_C: "1", weatherDesc: [{ value: "Clear" }] }],
  nearest_area: [{ areaName: [{ value: "Paris" }] }],
  weather: [{ date: "2026-09-21", hourly: [{ time: "1200", weatherCode: "113" }] }]
}))
assert.ok(smallWttr)
assert.equal(smallWttr.current_condition[0].temp_C, "1")

const tooManyDays = []
for (let i = 0; i < Model.maxForecastDays + 1; i++) tooManyDays.push({ date: "2026-09-21", hourly: [] })
assert.equal(Model.parseWttrReport(JSON.stringify({ weather: tooManyDays })), null)

const longDay = { date: "2026-09-21", hourly: [] }
for (let i = 0; i < Model.maxWttrHoursPerDay + 1; i++) longDay.hourly.push({ time: "1200" })
assert.equal(Model.parseWttrReport(JSON.stringify({ weather: [longDay] })), null)

const bulky = { current_condition: [], notes: [] }
for (let i = 0; i < Model.maxJsonArray + 1; i++) bulky.notes.push("x")
assert.equal(Model.parseWttrReport(JSON.stringify(bulky)), null)

const longString = { current_condition: [{ temp_C: "x".repeat(Model.maxJsonStringChars + 1) }] }
assert.equal(Model.parseWttrReport(JSON.stringify(longString)), null)

const hourlyTimes = []
for (let i = 0; i < 144; i++) hourlyTimes.push("2026-09-20T00:00")
const meteoOk = Model.parseOpenMeteoReport(JSON.stringify({
  current: { temperature_2m: 20 },
  hourly: { time: hourlyTimes, uv_index: hourlyTimes.map(() => 1) },
  daily: { time: ["2026-09-20", "2026-09-21"], temperature_2m_max: [20, 21], temperature_2m_min: [10, 11] }
}))
assert.ok(meteoOk)
assert.equal(meteoOk.hourly.time.length, 144)

const tooManyHours = hourlyTimes.concat(hourlyTimes)
assert.equal(Model.parseOpenMeteoReport(JSON.stringify({ hourly: { time: tooManyHours } })), null)

const geoResults = []
for (let i = 0; i < 10; i++) {
  geoResults.push({ name: "City " + i, admin1: "Region", country: "Country", latitude: i, longitude: i + 0.5 })
}
geoResults.push({ name: "x".repeat(121), latitude: 1, longitude: 2 })
const suggestions = Model.parseGeocodingResults(JSON.stringify({ results: geoResults }))
assert.equal(suggestions.length, Model.maxGeocodeResults)
assert.equal(suggestions[0].name, "City 0")
assert.equal(suggestions[0].latitude, 0)
const skippedName = Model.parseGeocodingResults(JSON.stringify({
  results: [
    { name: "x".repeat(121), latitude: 1, longitude: 2 },
    { name: "Kept", admin1: "Region", country: "Country", latitude: 3, longitude: 4 }
  ]
}))
assert.equal(skippedName.length, 1)
assert.equal(skippedName[0].name, "Kept")
assert.equal(Model.parseGeocodingResults("a".repeat(Model.maxResponseChars)).length, 0)
assert.equal(Model.parseGeocodingResults("{\"results\":[").length, 0)

assert.equal(Model.boundedLocationLabel("  Boardman, Oregon, US\n"), "Boardman")
assert.equal(Model.boundedLocationLabel(""), "")
assert.equal(Model.boundedLocationLabel("x".repeat(Model.maxLocationChars + 1)), "")
assert.equal(Model.boundedLocationLabel("City\nMore"), "")

const cappedHours = []
for (let i = 0; i < Model.maxHourlyPoints + 10; i++) cappedHours.push("2026-09-20T01:00")
assert.equal(Model.openMeteoHourlyPrecip({ hourly: { time: cappedHours, precipitation: cappedHours.map(() => 1) } }).length, Model.maxHourlyPoints)

console.log("payton.forecast model tests passed")
