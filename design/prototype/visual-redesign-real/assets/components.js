// Keep saved preview links on the complete, shared desktop/TV component board.
const componentBoard = new URL('../components/index.html', document.currentScript.src);
componentBoard.search = location.search;
componentBoard.hash = location.hash;
location.replace(componentBoard.href);
