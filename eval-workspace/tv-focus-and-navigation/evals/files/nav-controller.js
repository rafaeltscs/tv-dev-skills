// Generic TV UI framework — see _framework.md for the conventions.
//
// NavController sits near the root of the focus path and is where global
// Back handling lives. `router.pop()` navigates back one screen;
// `router.stackDepth` is the number of screens on the stack (1 == the
// home screen, nothing left to pop). When pop() is called at depth 1 the
// platform closes the app.

export class NavController {
  constructor(router) {
    this.router = router;
    this.filterDrawerOpen = false;
  }

  handleBack() {
    this.router.pop();
    return true;
  }

  openFilterDrawer() {
    this.filterDrawerOpen = true;
    this.refocus();
  }

  closeFilterDrawer() {
    this.filterDrawerOpen = false;
    this.refocus();
  }
}
