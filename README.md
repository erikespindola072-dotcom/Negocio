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

**End of each service day → Sales tab**
- Enter cash and card totals. If you also count **plates sold**, the ingredients are subtracted from stock automatically.

**Anything else you pay for → Costs tab**
- Fuel, propane, commissary, permits, insurance, repairs, card fees…

**Menu tab: what each plate really costs**
- Add each dish with its ingredients per plate (use the item's unit: ¼ lb shrimp = `0.25`, 3 tortillas from a 30-pack = `0.1`).
- The app uses your *latest* purchase prices. When avocados jump 30% you'll see which dishes went over your food-cost goal and what price would fix it.

**Home tab: the weekly picture**
- Sales, expenses, profit and food cost % (rolling 4 weeks), compared with the previous week
- ⏰ **Use it or lose it**: perishables about to expire. Run a special, or tap *Toss* to log them as waste
- 📉 Running low · 💲 Biggest price changes · 🍽️ Dishes over food-cost goal · 8-week chart

**More tab**
- 🗑️ **Waste log**: what you throw away is money lost. Tracking it shows what you over-buy.
- 📊 **Reports**: profit & loss by month and week, plus CSV export for your accountant and taxes.
- 💾 **Backup / restore**: your data lives on this device. **Download a backup every week.**
- ⚙️ Settings: business name, currency, first day of the week, food-cost goal.

Want to look around first? Tap **Explore with sample data** (or More → Data → Load sample data).

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
- **Receipt photos** attached to purchases and expenses for taxes.
- **Recurring expenses** (insurance, commissary rent) added automatically each month.
- **Price comparison by supplier**: which store is cheapest for limes this month.
- **Prep list**: "for 80 plates Saturday you need 24 lb shrimp, 20 avocados…" based on past sales by weekday and location.
- **Break-even tracker**: how many plates a day cover your fixed costs.
- **Labor and hours**, plus **sales tax** set-aside.
- **Square / Toast / Clover import**, so sales come in from your POS automatically.
