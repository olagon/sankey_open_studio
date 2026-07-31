# Sankey Open Studio

A free, open source sankey diagram builder that runs entirely in your browser. No accounts, no servers, no build step. Your data never leaves your computer.

Built with pure HTML, CSS, and JavaScript. Zero dependencies.

## Quick start

Download the three files (`index.html`, `style.css`, `app.js`) into one folder and open `index.html` in any modern browser. That is the whole install.

You can also host the folder anywhere static files are served, such as GitHub Pages.

## Features

- **Unlimited diagrams**, saved automatically in your browser as you work
- **Paste from a spreadsheet.** Copy three columns (From, To, Amount) from Excel, Google Sheets, or a CSV file and paste them in. Tabs, commas, and semicolons are auto detected, header rows are skipped, and currency symbols in amounts are cleaned up
- **Editable data table** for adding, changing, and deleting flows by hand
- **Drag any node** to fine tune the layout, with a one click reset
- **Per node settings.** Click a node to change its label, color, and up to two extra lines of custom text
- **Label settings** for font size, position, decimal places, and value prefix and suffix (for example `$` and `M`)
- **Layout settings** for canvas size, node width, node spacing, and flow opacity
- **Color tools** including a colorblind safe palette, custom colors, flow coloring by source or target, and one click auto coloring of source nodes
- **Export** to SVG, PNG (2x resolution), or a JSON backup you can import on another computer

## Data format

Each row of data is one flow:

```
From                  To                   Amount
General Excise Tax    State General Fund   4930.4
Individual Income Tax State General Fund   2923.1
State General Fund    Public Schools       2623.7
```

Node totals are computed automatically as the larger of a node's inflow and outflow. Middle nodes (like a general fund or a revenue node) balance on their own when the amounts on each side add up.

## Where your data lives

Diagrams are stored in your browser's local storage on your machine. Clearing site data in your browser will remove them, so use **Download → JSON backup** for anything you care about. A JSON backup can be brought back on any computer with **Restore from JSON**.

## How to guide

A simple user guide ships with the app as [guide.html](guide.html), linked from the Guide button in the top bar.

## Analytics and privacy

Diagram data never leaves the browser. The hosted version includes a Google Analytics tag that counts page views and anonymous feature events (diagram created, data pasted, exports, restores); no diagram content is ever sent. See [privacy.html](privacy.html) for the full policy. If you self host, delete the gtag snippet from the top of `index.html`, `guide.html`, and `privacy.html` and nothing is tracked at all.

## Browser support

Any recent Chrome, Edge, Firefox, or Safari. No internet connection is required after the files are on your machine.

## Contributing

Issues and pull requests are welcome. The whole app is three files with no tooling, so the barrier to entry is low on purpose. Please keep it dependency free.

## Credits

Made by [Olin Lagon](https://www.linkedin.com/in/olinlagon).

## License

MIT. See [LICENSE](LICENSE).
