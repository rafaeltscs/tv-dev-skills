// The "Browse all" screen. `catalog` is the full result set from the API —
// typically 400-800 title objects { id, title, artworkUrl }. It is laid
// out as one long vertical list of horizontal rows (6 tiles per row).
//
// Symptom: opening this screen takes several seconds on a TV and memory
// use climbs the whole time the user scrolls; scrolling back up does not
// bring it down. On a good laptop it's instant.

export default class CatalogScreen {
  constructor(catalog) {
    this.catalog = catalog;
    this.scrollY = 0;
  }

  onScroll(offset) {
    this.scrollY = offset;
    this.update();
  }

  render() {
    const rows = [];
    for (let i = 0; i < this.catalog.length; i += 6) {
      const rowItems = this.catalog.slice(i, i + 6);
      rows.push({
        type: 'group',
        y: (i / 6) * 430 - this.scrollY,
        children: rowItems.map((item, c) => ({
          type: 'group',
          x: c * 320,
          w: 280,
          h: 400,
          children: [
            { type: 'image', w: 280, h: 400, src: item.artworkUrl },
            { type: 'text', y: 405, text: item.title },
          ],
        })),
      });
    }
    return { type: 'group', x: 60, y: 40, children: rows };
  }
}
