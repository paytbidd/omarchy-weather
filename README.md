# Omarchy Forecast

[Omarchy](https://omarchy.org/) bar weather pill (**Forecast**). Temperature stays on the bar.
A UV chip shows during the day. A rain chip shows only while it is raining or
due within about eight hours.

Click the pill for the detail popup (location, forecast, condition glyph).
Right-click sends a notification. Middle-click refreshes.

This is a fork of Omarchy’s stock weather widget. Location still uses
`omarchy-weather-location`.

## Install

```bash
omarchy plugin add https://github.com/paytbidd/omarchy-weather.git --yes --enable
```

Place it in the **center** section, next to the clock.

Update later with:

```bash
omarchy plugin update payton.weather
```

## Bar

| Chip | When it shows |
| --- | --- |
| Temperature (`79°`) | Always, once a report is in |
| `UV N` | Daytime and rounded UV ≥ 1 |
| `RAIN` / `RAIN Nh` | Raining now, or rain within ~8 hours |

Night hides UV. Dry hours hide rain.

## Tests

```bash
node tests/model.test.js
```
