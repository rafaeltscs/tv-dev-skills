// A catalog poster grid. `items` is ~120 movie objects from the API:
//   { id, title, artworkUrl }
// artworkUrl points at the image service and returns a 2000x3000 master
// image (the service also accepts ?w=&h= resize params, but nobody uses
// them here).
//
// Each poster renders into a 260x390 cell. On the dev machine this looks
// fine; on a 2020 TV the grid shows blank cells while scrolling, images
// pop in slowly, and after browsing a few categories the app dies.

export default class PosterGrid {
  constructor(items) {
    this.items = items;
  }

  render() {
    return {
      type: 'group',
      x: 80,
      y: 60,
      children: this.items.map((item, i) => ({
        type: 'group',
        x: (i % 5) * 300,
        y: Math.floor(i / 5) * 430,
        w: 260,
        h: 390,
        children: [
          {
            type: 'image',
            w: 260,
            h: 390,
            src: item.artworkUrl,
          },
          {
            type: 'text',
            y: 395,
            text: item.title,
          },
        ],
      })),
    };
  }
}
