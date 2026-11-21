// Builds assets/card.svg: a neofetch-style terminal card with the Future42 pixel logo + live GitHub stats.
// Runs in GitHub Actions (GITHUB_TOKEN) or locally: GITHUB_TOKEN=$(gh auth token) node scripts/build_card.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LOGIN = process.env.PROFILE_LOGIN || "dmoney25632";
const TZ = process.env.PROFILE_TZ || "America/Denver";
const TOKEN = process.env.GH_STATS_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("Set GITHUB_TOKEN");

// midnight today in the profile's time zone, as ISO with offset
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // YYYY-MM-DD
const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
  .formatToParts(now).find((p) => p.type === "timeZoneName").value.replace("GMT", "") || "+00:00";
const todayStart = `${today}T00:00:00${off}`;
const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 0 = Sunday
const weekStartDate = new Date(Date.parse(today + "T12:00:00Z") - dow * 864e5).toISOString().slice(0, 10);
const weekStart = `${weekStartDate}T00:00:00${off}`;

const query = `query($login:String!, $from:DateTime!, $weekFrom:DateTime!, $to:DateTime!){
  user(login:$login){
    name createdAt location company websiteUrl twitterUsername
    today: contributionsCollection(from:$from, to:$to){ contributionCalendar{ totalContributions } }
    week: contributionsCollection(from:$weekFrom, to:$to){ contributionCalendar{ totalContributions } }
    contributionsCollection{
      totalCommitContributions
      contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount date weekday } } }
    }
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, orderBy:{field:PUSHED_AT,direction:DESC}){
      nodes{ languages(first:8, orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } }
    }
  }
}`;
let data, errors;
for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login: LOGIN, from: todayStart, weekFrom: weekStart, to: now.toISOString() } }),
});
    ({ data, errors } = await res.json());
    break;
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((r) => setTimeout(r, 5000 * attempt)); // GitHub API hiccup: retry
  }
}
if (errors) throw new Error(JSON.stringify(errors));
const u = data.user;
const cal = u.contributionsCollection.contributionCalendar;

// ---- derived stats
const days = cal.weeks.flatMap((w) => w.contributionDays);
let streak = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) streak++;
  else if (i === days.length - 1) continue; // today not started yet
  else break;
}
let longest = 0, run = 0;
for (const d of days) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
const bestDay = days.reduce((m, d) => (d.contributionCount > m.contributionCount ? d : m), days[0]);
const activeDays = days.filter((d) => d.contributionCount > 0).length;
const avg = cal.totalContributions / Math.max(1, days.length);
// calendar buckets are UTC-dated; this window is midnight→now in TZ and includes private-repo work
const todayCount = u.today.contributionCalendar.totalContributions;
const weekCount = u.week.contributionCalendar.totalContributions;

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const wdSum = Array(7).fill(0), wdN = Array(7).fill(0);
for (const d of days) { wdSum[d.weekday] += d.contributionCount; wdN[d.weekday]++; }
const wdAvg = wdSum.map((s, i) => s / Math.max(1, wdN[i]));
const busiest = wdAvg.indexOf(Math.max(...wdAvg));
const last30 = days.slice(-30);

const langs = {};
for (const r of u.repositories.nodes)
  for (const e of r.languages.edges) {
    langs[e.node.name] ??= { size: 0, color: e.node.color || "#8b949e" };
    langs[e.node.name].size += e.size;
  }
const langTotal = Object.values(langs).reduce((s, l) => s + l.size, 0) || 1;
const topLangs = Object.entries(langs).sort((a, b) => b[1].size - a[1].size).slice(0, 6);

const years = (Date.now() - new Date(u.createdAt)) / 3.156e10;
const uptime = years >= 1 ? `${Math.floor(years)}y ${Math.floor((years % 1) * 12)}m` : `${Math.floor(years * 12)} months`;
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shortDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// ---- palette + layout
const C = { bg: "#0d1117", panel: "#161b22", line: "#30363d", green: "#39d353", dim: "#8b949e", text: "#e6edf3", key: "#ffa657" };
const PAD = 28, TOP = 56, P = 6; // P = pixel size for the logo
const grid = readFileSync("assets/ascii.txt", "utf8").trimEnd().split("\n");
const cols = Math.max(...grid.map((l) => [...l].length));
const LW = cols * P;
const IX = PAD + LW + 48;
const TW = 128, TG = 8, RW = 3 * TW + 2 * TG;
const W = IX + RW + PAD;

// logo as real pixels (each char = 2 vertical pixels), swept in column by column
let logo = "";
grid.forEach((line, r) => {
  [...line].forEach((ch, c) => {
    const top = ch === "█" || ch === "▀", bot = ch === "█" || ch === "▄";
    const delay = `style="animation-delay:${(c * 0.018).toFixed(3)}s"`;
    if (top && bot) logo += `<rect x="${PAD + c * P}" y="${TOP + r * 2 * P}" width="${P - 0.6}" height="${2 * P - 0.6}" class="px" ${delay}/>`;
    else if (top) logo += `<rect x="${PAD + c * P}" y="${TOP + r * 2 * P}" width="${P - 0.6}" height="${P - 0.6}" class="px" ${delay}/>`;
    else if (bot) logo += `<rect x="${PAD + c * P}" y="${TOP + r * 2 * P + P}" width="${P - 0.6}" height="${P - 0.6}" class="px" ${delay}/>`;
  });
});
let ly = TOP + grid.length * 2 * P + 30;

// left: last 30 days bars
const max30 = Math.max(1, ...last30.map((d) => d.contributionCount));
const BH = 64, bw = LW / last30.length;
let left = `<text x="${PAD}" y="${ly}" font-size="12" fill="${C.dim}">— last 30 days —</text>`;
ly += 12;
last30.forEach((d, i) => {
  const h = Math.max(2, (d.contributionCount / max30) * BH);
  const isToday = i === last30.length - 1;
  left += `<rect x="${(PAD + i * bw).toFixed(1)}" y="${(ly + BH - h).toFixed(1)}" width="${(bw - 2.5).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${isToday ? C.key : d.contributionCount ? C.green : C.line}" class="bar" style="animation-delay:${(1 + i * 0.03).toFixed(2)}s"><title>${d.date}: ${d.contributionCount}</title></rect>`;
});
left += `<text x="${PAD}" y="${ly + BH + 15}" font-size="10.5" fill="${C.dim}">${shortDate(last30[0].date)}</text><text x="${PAD + LW}" y="${ly + BH + 15}" font-size="10.5" fill="${C.dim}" text-anchor="end">today</text>`;
ly += BH + 40;

// left: weekday rhythm
left += `<text x="${PAD}" y="${ly}" font-size="12" fill="${C.dim}">— weekly rhythm (avg / day) —</text>`;
ly += 12;
const maxWd = Math.max(...wdAvg, 1), WBW = LW - 80;
WD.forEach((name, i) => {
  const y0 = ly + i * 15, w = Math.max(2, (wdAvg[i] / maxWd) * WBW);
  left += `<text x="${PAD}" y="${y0 + 9}" font-size="11" fill="${i === busiest ? C.key : C.text}">${name}</text>
  <rect x="${PAD + 36}" y="${y0 + 1}" width="${w.toFixed(1)}" height="9" rx="2" fill="${i === busiest ? C.key : C.green}" opacity="${i === busiest ? 1 : 0.75}"/>
  <text x="${PAD + 42 + w}" y="${y0 + 9}" font-size="10.5" fill="${C.dim}">${wdAvg[i].toFixed(1)}</text>`;
});
ly += 7 * 15;

// right: info
let y = TOP + 8, right = "";
const kv = (k, v) => { right += `<text x="${IX}" y="${y}" font-size="13.5"><tspan fill="${C.key}">${esc(k)}</tspan><tspan fill="${C.dim}">: </tspan><tspan fill="${C.text}">${esc(v)}</tspan></text>`; y += 21; };
right += `<text x="${IX}" y="${y}" font-size="17" fill="${C.green}" font-weight="700">dayton@future42</text>`; y += 12;
right += `<text x="${IX}" y="${y}" fill="${C.line}" font-size="13">──────────────────────────────────────</text>`; y += 22;
kv("Name", u.name || LOGIN);
kv("Org", u.company || "—");
kv("Location", u.location || "—");
kv("Site", (u.websiteUrl || "").replace(/^https?:\/\//, ""));
kv("X", u.twitterUsername ? "@" + u.twitterUsername : "—");
kv("Uptime", uptime + " on GitHub");
kv("Shell", "building code for a different end user");
kv("Motto", "CALI ES CALI, LO DEMÁS ES LOMA");
y += 8;
right += `<text x="${IX}" y="${y}" font-size="12" fill="${C.dim}">— stats (last 12 months) —</text>`; y += 12;

const tiles = [
  [fmt(cal.totalContributions), "contributions"],
  [fmt(todayCount), "today"],
  [fmt(weekCount), "this week"],
  [`${streak}d`, "current streak"],
  [`${longest}d`, "longest streak"],
  [avg.toFixed(1), "avg / day"],
];
const TH = 56;
const fit = (str, fs) => ([...str].length * fs * 0.62 > TW - 28 ? ` textLength="${TW - 28}" lengthAdjust="spacingAndGlyphs"` : "");
tiles.forEach(([v, l], i) => {
  const tx = IX + (i % 3) * (TW + TG), ty = y + Math.floor(i / 3) * (TH + TG);
  right += `<g class="pop" style="animation-delay:${0.5 + i * 0.12}s">
    <rect x="${tx}" y="${ty}" width="${TW}" height="${TH}" rx="6" fill="${C.panel}" stroke="${C.line}"/>
    <text x="${tx + 14}" y="${ty + 28}" font-size="20" font-weight="700" fill="${C.green}"${fit(v, 20)}>${esc(v)}</text>
    <text x="${tx + 14}" y="${ty + 45}" font-size="11" fill="${C.dim}"${fit(l, 11)}>${esc(l)}</text></g>`;
});
y += 2 * (TH + TG) + 14;

right += `<text x="${IX}" y="${y}" font-size="12" fill="${C.dim}">— languages —</text>`; y += 12;
let lx = IX, bar = "", legend = "";
topLangs.forEach(([name, l], i) => {
  const w = Math.max(3, (l.size / langTotal) * RW);
  bar += `<rect x="${lx}" y="${y}" width="${w}" height="10" fill="${l.color}"/>`;
  lx += w;
  const col = i % 3, row = Math.floor(i / 3);
  legend += `<circle cx="${IX + 5 + col * 136}" cy="${y + 27 + row * 18}" r="4.5" fill="${l.color}"/><text x="${IX + 15 + col * 136}" y="${y + 31 + row * 18}" font-size="11.5" fill="${C.text}">${esc(name.length > 11 ? name.slice(0, 10) + "…" : name)} <tspan fill="${C.dim}">${((l.size / langTotal) * 100).toFixed(1)}%</tspan></text>`;
});
right += `<clipPath id="lb"><rect x="${IX}" y="${y}" width="${RW}" height="10" rx="5"/></clipPath><g clip-path="url(#lb)">${bar}</g>${legend}`;
y += 27 + Math.ceil(topLangs.length / 3) * 18;
right += `<text x="${IX}" y="${y + 6}" font-size="11.5" fill="${C.dim}">${fmt(activeDays)} active days · most active on <tspan fill="${C.key}">${WD[busiest]}s</tspan></text>`;
y += 6;

const H = Math.max(ly, y) + PAD;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">
<defs><filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>
  .px{fill:${C.green};opacity:0;animation:in .25s ease forwards}
  .pop,.bar{opacity:0;animation:in .5s ease forwards}
  .cur{animation:blink 1s steps(1) infinite}
  @keyframes in{to{opacity:1}}
  @keyframes blink{50%{opacity:0}}
</style>
<rect width="${W}" height="${H}" rx="14" fill="${C.bg}" stroke="${C.line}"/>
<rect width="${W}" height="34" rx="14" fill="${C.panel}"/><rect y="20" width="${W}" height="14" fill="${C.panel}"/>
<line x1="0" y1="34" x2="${W}" y2="34" stroke="${C.line}"/>
<circle cx="22" cy="17" r="6" fill="#ff5f57"/><circle cx="42" cy="17" r="6" fill="#febc2e"/><circle cx="62" cy="17" r="6" fill="#28c840"/>
<text x="${W / 2}" y="22" text-anchor="middle" font-size="12.5" fill="${C.dim}">${esc(LOGIN)}@future42: ~ — neofetch<tspan class="cur" fill="${C.green}"> ▍</tspan></text>
<g filter="url(#glow)">${logo}</g>
${left}
<line x1="${IX - 24}" y1="${TOP - 8}" x2="${IX - 24}" y2="${H - PAD}" stroke="${C.line}" stroke-dasharray="2 4"/>
${right}
<text x="${W - 16}" y="${H - 10}" text-anchor="end" font-size="9.5" fill="${C.line}">updated ${now.toISOString().slice(0, 16).replace("T", " ")} UTC</text>
</svg>`;
writeFileSync("assets/card.svg", svg);
console.log(`card ${W}x${H} | total ${cal.totalContributions} | today ${todayCount} | week ${weekCount} | streak ${streak}d | longest ${longest}d | best ${bestDay.contributionCount} on ${bestDay.date} | avg ${avg.toFixed(1)} | busiest ${WD[busiest]}`);
