# Omarchy Forecast

[Omarchy](https://omarchy.org/) bar weather pill (**Forecast**). Temperature stays on the bar.
A UV chip shows during the day. A rain chip shows only while it is raining or
due within about eight hours. The next sunrise or sunset sits beside that.

Click the pill for the detail popup. Conditions run in one row under the
temperature. Sunrise and sunset sit on the next line. The bottom row is the
next five days.
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
omarchy plugin update payton.forecast
```

## Remove

```bash
omarchy plugin remove payton.forecast
```

## Bar

| Chip | When it shows |
| --- | --- |
| Temperature (`79°`) | Always, once a report is in |
| `UV N` | Daytime and rounded UV ≥ 1 |
| `RAIN` / `RAIN Nh` | Raining now, or rain within ~8 hours |
| `↑ 6:42a` / `↓ 7:18p` | Next sunrise or sunset only. After sunset it rolls to tomorrow's sunrise. |

Night hides UV. Dry hours hide rain.

## Tests

```bash
node tests/model.test.js
```
