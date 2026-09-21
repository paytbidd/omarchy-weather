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

console.log("payton.weather model tests passed")
