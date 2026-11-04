# TruckBook 🦐

Inventory, weekly purchases, sales and expenses for a seafood food truck.
It's a simple web app: no server, no account, no monthly fee. It works offline and saves to your phone.

## How to use it

**Every week when you shop → Buy tab**
1. Look at the **Shopping list**. It shows everything below its *par* (the amount you want on hand), grouped by store.
   Tap **Share** to text it to yourself, or **Buy these** to start a purchase from it.
2. Enter what you actually bought and the price you paid. The app:
   - adds the quantities to your stock
   - remembers this week's price and shows how it compares to last time (▲ / ▼)
   - resets the "fresh for N days" clock on perishables
   - records the total as an **Ingredients** expense

**📋 Plan ahead (Buy tab)**
- Once you count plates sold for a few days, the app forecasts your next service days. It averages the same weekday over the last 8 weeks, so Fridays are forecast from past Fridays.
- It turns that forecast into an ingredient list: what you need, what you have (expired stock doesn't count), and what to buy, with an optional safety extra (+10%, +20%…).
- **Buy these** starts a purchase from the shortfall. **Share prep list** texts it to whoever does prep.

**📷 Receipt photos**: attach a photo of the receipt to any purchase or expense. Photos are shrunk so they don't fill up your phone, and they're included in backups.

**End of each service day → Sales tab**
- Enter cash and card totals. If you also count **plates sold**, the ingredients are subtracted from stock automatically.

**Anything else you pay for → Costs tab**
- Fuel, propane, commissary, permits, insurance, repairs, card fees…
- **🔁 Recurring bills**: set up rent, insurance, phone or loan payments once and they're added automatically every month or week. If you set a start date in the past, the missed charges are filled in.

**Menu tab: what each plate really costs**
- Add each dish with its ingredients per plate (use the item's unit: ¼ lb shrimp = `0.25`, 3 tortillas from a 30-pack = `0.1`).
- The app uses your *latest* purchase prices. When avocados jump 30% you'll see which dishes went over your food-cost goal and what price would fix it.

**Home tab: the weekly picture**
- Sales, expenses, profit and food cost % (rolling 4 weeks), compared with the previous week
- ⏰ **Use it or lose it**: perishables about to expire. Run a special, or tap *Toss* to log them as waste
- ⚖️ **Break-even**: how much you need to sell per service day to cover your costs, and whether you're above or below it
- 💾 Reminder when your last backup is more than a week old
- 📉 Running low · 💲 Biggest price changes · 🍽️ Dishes over food-cost goal · 8-week chart

**More tab**
- 🗑️ **Waste log**: what you throw away is money lost. Tracking it shows what you over-buy.
- 📊 **Reports**: 🏆 which supplier is cheapest for each item, 🎢 the most volatile prices, profit & loss by month and week, plus CSV export for your accountant and taxes.
- 💾 **Backup / restore**: your data lives on this device. **Download a backup every week.**
- ⚙️ Settings: business name, currency, first day of the week, food-cost goal.

Want to look around first? Tap **Explore with sample data** (or More → Data → Load sample data).

## Use it as a claude.ai Artifact (recommended)

Live page: https://claude.ai/artifact/N1yXPDNdfqSCn7PriSZF3S (private to you until you share it).

As an artifact, TruckBook saves everything to your Claude account instead of only the phone:
your data shows up on any device where you open the link, receipt photos are stored with the
artifact, and backups and CSV exports are offered as files to save. Only you and people you give
**Edit** access in the Share menu can see or change the data. Give an employee edit access and you
both work on the same inventory. The pill in the top bar shows **Saved**, **Saving…** or
**Offline · kept on this device**; offline changes upload the next time the page connects.

To update the artifact after changing the code, run `python3 artifact/build.py`. It inlines
`index.html`, `styles.css`, `app.js` and the icon into `artifact/truckbook.html`, which is the
file that gets published.

## Running it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

### Put it on your phone (free)
1. In GitHub: **Settings → Pages → Deploy from branch**, pick your branch and the `/ (root)` folder.
2. Open the URL GitHub gives you on your phone.
3. **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).
   It opens like a normal app and works without signal.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell and bottom tab bar |
| `app.js` | All the logic: data, screens, calculations, sample data |
| `styles.css` | Mobile-first styles with automatic dark mode |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Offline support and "install as app" |

## Ideas for next steps

- **Cloud sync and multiple devices** (e.g. Supabase) so you and an employee share one inventory, with automatic backups.
- **Location-aware forecasts**: brewery Saturdays vs. downtown Tuesdays.
- **First-in-first-out freshness**: track each delivery separately instead of one freshness date per item.
- **Labor and hours**, plus **sales tax** set-aside.
- **Square / Toast / Clover import**, so sales come in from your POS automatically.
