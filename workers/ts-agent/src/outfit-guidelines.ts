/**
 * Outfit guidelines resource content (for LLM to read and suggest based on weather)
 */
export const OUTFIT_GUIDELINES_TEXT = `
# Weather Outfit Guidelines

These are evidence-based outfit suggestions. Please give friendly recommendations based on the user's local weather (feels-like temperature, wind, humidity, rain, sun, etc.). For reference only.

## 1. Feels-Like Temperature as Reference
Feels-like already factors in wind chill and heat index, so it better reflects how it actually feels. Prefer **feels-like temperature** when judging how much to wear.

- **Above 30°C (86°F)**: Warm; light, loose, light-colored breathable shorts/short sleeves; consider sun protection (hat, sunglasses).
- **25–30°C (77–86°F)**: Hot; short or thin long sleeves, breathable fabrics.
- **20–25°C (68–77°F)**: Comfortable; thin long sleeves and pants; a light layer for those who run cold.
- **15–20°C (59–68°F)**: Cool; long sleeves, pants, light jacket or sweater.
- **10–15°C (50–59°F)**: Chilly; consider a mid layer (sweater/fleece) and a wind-resistant outer layer.
- **5–10°C (41–50°F)**: Cold; coat or down jacket, scarf, gloves tend to feel better.
- **Below 5°C (41°F)**: Very cold; consider a heavy coat/down, hat, gloves, thick socks, and paying attention to hands and feet.

## 2. Humidity
Humidity affects heat transfer and sweat evaporation:
- **Hot + humid (e.g. humidity > 70%)**: Sweat evaporates less; consider avoiding heavy cotton (stays wet on skin) and opting for moisture-wicking fabrics.
- **Cold + humid**: Moisture draws heat from the body; a water-resistant outer layer can help avoid getting chilled when damp.

## 3. Wind Speed & Gusts
Wind disrupts the warm air layer around the body (reducing clothing insulation):
- **Light wind (< 3 m/s)**: Little impact on what to wear.
- **Moderate to strong wind (3–8 m/s)**: Feels cooler; consider denser fabrics or a light wind layer.
- **Strong wind (> 8 m/s or gusty)**: Consider a windbreaker as the outer layer to trap warmth; loose, breezy clothes may feel less comfortable.

## 4. Rain & Snow
- **When rain or snow is possible)**: Consider a waterproof outer layer (e.g. rain jacket) and slip-resistant, water-resistant footwear.
- **Rainy days)**: Cotton and denim dry slowly when wet; consider avoiding them in favor of quick-dry or water-resistant options.
- **10–15°C (50–59°F)**: Chilly; consider a mid layer (sweater/fleece) and a wind-resistant outer layer.
## 5. Three-Layer System
For changeable weather or large temperature swings, the layering approach can help:
1. **Base layer**: Moisture management next to skin (e.g. wicking or thermal, depending on temperature).
2. **Mid layer**: Warmth and trapped air (e.g. fleece, wool, sweater).
3. **Outer layer**：Wind and rain protection (windproof/waterproof jacket).
Humidity affects heat transfer and sweat evaporation:
## 6. Sun & Cloud Cover
- **Daytime with low clouds (e.g. < 30%)**：UV can still be high; consider sun protection (sunglasses, sunscreen, hat).
- **Around or after sunset**：Temperature often drops after the sun goes down; if staying out late, consider bringing an extra warm layer.
## 3. Wind Speed & Gusts
Wind disrupts the warm air layer around the body (reducing clothing insulation):
- **Light wind (< 3 m/s)**: Little impact on what to wear.
- **Moderate to strong wind (3–8 m/s)**: Feels cooler; consider denser fabrics or a light wind layer.
- **Strong wind (> 8 m/s or gusty)**: Consider a windbreaker as the outer layer to trap warmth; loose, breezy clothes may feel less comfortable.

## 4. Rain & Snow
- **When rain or snow is possible)**: Consider a waterproof outer layer (e.g. rain jacket) and slip-resistant, water-resistant footwear.
- **Rainy days)**: Cotton and denim dry slowly when wet; consider avoiding them in favor of quick-dry or water-resistant options.

## 5. Three-Layer System
For changeable weather or large temperature swings, the layering approach can help:
1. **Base layer**: Moisture management next to skin (e.g. wicking or thermal, depending on temperature).
2. **Mid layer**: Warmth and trapped air (e.g. fleece, wool, sweater).
3. **Outer layer**: Wind and rain protection (windproof/waterproof jacket).

## 6. Sun & Cloud Cover
- **Daytime with low clouds (e.g. < 30%)**: UV can still be high; consider sun protection (sunglasses, sunscreen, hat).
- **Around or after sunset)**: Temperature often drops after the sun goes down; if staying out late, consider bringing an extra warm layer.
`.trim();
