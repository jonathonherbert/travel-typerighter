/*
 * Javascript Diff Algorithm
 *  By John Resig (http://ejohn.org/)
 *  Modified by Chu Alan "sprite"
 *
 * Released under the MIT license.
 *
 * More Info:
 *  http://ejohn.org/projects/javascript-diff-algorithm/
 */

export function diffString2(o: string, n: string) {
  o = o.replace(/\s+$/, "");
  n = n.replace(/\s+$/, "");

  return diff(o === "" ? [] : o.split(/\s+/), n === "" ? [] : n.split(/\s+/));
}

function diff(_o: string[], _n: string[]) {
  const ns = {} as any;
  const os = {} as any;
  const o = _o as any;
  const n = _n as any;

  for (let i = 0; i < n.length; i++) {
    if (ns[n[i]] == null) ns[n[i]] = { rows: [], o: null };
    ns[n[i]].rows.push(i);
  }

  for (let i = 0; i < o.length; i++) {
    if (os[o[i]] == null) os[o[i]] = { rows: [], n: null };
    os[o[i]].rows.push(i);
  }

  for (const i in ns) {
    if (
      ns[i].rows.length === 1 &&
      typeof os[i] != "undefined" &&
      os[i].rows.length === 1
    ) {
      n[ns[i].rows[0]] = { text: n[ns[i].rows[0]], row: os[i].rows[0] };
      o[os[i].rows[0]] = { text: o[os[i].rows[0]], row: ns[i].rows[0] };
    }
  }

  for (let i = 0; i < n.length - 1; i++) {
    if (
      n[i].text != null &&
      n[i + 1].text == null &&
      n[i].row + 1 < o.length &&
      o[n[i].row + 1].text == null &&
      n[i + 1] === o[n[i].row + 1]
    ) {
      n[i + 1] = { text: n[i + 1], row: n[i].row + 1 };
      o[n[i].row + 1] = { text: o[n[i].row + 1], row: i + 1 };
    }
  }

  for (let i = n.length - 1; i > 0; i--) {
    if (
      n[i].text != null &&
      n[i - 1].text == null &&
      n[i].row > 0 &&
      o[n[i].row - 1].text == null &&
      n[i - 1] === o[n[i].row - 1]
    ) {
      n[i - 1] = { text: n[i - 1], row: n[i].row - 1 };
      o[n[i].row - 1] = { text: o[n[i].row - 1], row: i - 1 };
    }
  }

  return { o: o, n: n };
}
