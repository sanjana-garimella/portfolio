import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// Scales are global so the brush functions can use them (Step 5.4)
let xScale;
let yScale;
let rScale;
let brush;

// Lab 8 Step 2.4: one color per technology (css, html, js, ...)
const colors = d3.scaleOrdinal(d3.schemeTableau10);

// Chart size and the area inside the margins (Step 2.2)
const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 20 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

// Step 1.1: read the CSV and convert numbers and dates from strings
async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

// Step 1.2: one object per commit, built from the per-line rows
function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      let first = lines[0];
      let { author, date, time, timezone, datetime } = first;
      let ret = {
        id: commit,
        url: 'https://github.com/sanjana-garimella/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        // e.g. 2:30 PM = 14.5
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      // Keep the lines, but hide them so console.log stays readable
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return ret;
    })
    // Lab 8 Step 3.3: oldest first, so the story and slider go in order
    .sort((a, b) => a.datetime - b.datetime);
}

// Step 1.3: summary stats. Lab 8: cleared and redrawn for the filtered commits
function renderCommitInfo(data, commits) {
  d3.select('#stats').html('');
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  // Number of distinct values
  dl.append('dt').text('Files');
  dl.append('dd').text(d3.group(data, (d) => d.file).size);

  // Grouped aggregate: longest line number in each file, then the average
  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (v) => v.line),
    (d) => d.file,
  );
  dl.append('dt').text('Average file length');
  dl.append('dd').text(Math.round(d3.mean(fileLengths, (d) => d[1])) + ' lines');

  // Aggregates over the whole dataset
  dl.append('dt').text('Longest line');
  dl.append('dd').text(d3.max(data, (d) => d.length) + ' chars');

  dl.append('dt').text('Max depth');
  dl.append('dd').text(d3.max(data, (d) => d.depth));

  // Min/max value: the time of day with the most lines written
  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most work done');
  dl.append('dd').text(maxPeriod);
}

// Step 2: scatterplot of commits, date on X and time of day on Y.
// Lab 8 Step 1.2: this only builds the parts that never change; the
// dots and the x axis are drawn by updateScatterPlot().
function renderScatterPlot(data, commits) {
  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Step 4: dot area shows lines edited. Sqrt scale so area, not
  // radius, is proportional to the number of lines. Built from all
  // commits so a dot keeps its size as the slider moves.
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  // Step 2.3: gridlines go first so they sit behind everything else
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  svg.append('g').attr('class', 'dots');

  // Step 2.2: axes, with times formatted like 08:00
  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`);

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  updateScatterPlot(data, commits);
  createBrushSelector(svg);
}

// Lab 8 Step 1.2: redraw the dots and x axis for the filtered commits
// without rebuilding the whole chart
function updateScatterPlot(data, commits) {
  const svg = d3.select('#chart').select('svg');

  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  // One tick per week with one date format, so labels don't overlap
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeWeek.every(1))
    .tickFormat(d3.timeFormat('%b %d'));
  svg.select('g.x-axis').call(xAxis);

  // Step 4.3: draw big dots first so small ones stay on top and hoverable
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg
    .select('g.dots')
    .selectAll('circle')
    // Lab 8 Step 1.3: key by commit id so each commit keeps its own circle
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    // Lab 8 Step 1.4: bigger dots take longer to grow in (see style.css)
    .style('--r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    })
    // New circles are appended at the end, so put them back in size order
    .order();

  // The x scale changed, so an old brush rectangle no longer matches the dots
  if (brush) {
    svg.call(brush.move, null);
  }
}

// Step 3: tooltip
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-tooltip-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString('en', {
    dateStyle: 'full',
  });
  time.textContent = commit.datetime?.toLocaleString('en', {
    timeStyle: 'short',
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const { width, height } = tooltip.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY;

  // Show it on the other side of the cursor if it would go off-screen
  if (x + width > window.innerWidth) x -= width;
  if (y + height > window.innerHeight) y -= height;

  tooltip.style.left = `${Math.max(0, x)}px`;
  tooltip.style.top = `${Math.max(0, y)}px`;
}

// Step 5: brushing
function createBrushSelector(svg) {
  brush = d3.brush().on('start brush end', brushed);
  svg.call(brush);

  // The brush overlay catches all mouse events, so move the dots
  // (and everything after the overlay) above it to get tooltips back
  svg.selectAll('.dots, .overlay ~ *').raise();
}

function brushed(event) {
  const selection = event.selection;
  d3.selectAll('#chart circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }

  const [x0, x1] = selection.map((d) => d[0]);
  const [y0, y1] = selection.map((d) => d[1]);

  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);

  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Lab 8: brushing only looks at the commits currently on the chart
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  countElement.textContent = `${
    selectedCommits.length || 'No'
  } commits selected`;

  return selectedCommits;
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? filteredCommits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  // Count lines per language
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// Lab 8 Step 2: unit visualization, one dot per line, grouped by file
function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((d) => d.lines);

  // Step 2.3: biggest file first
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        const dt = div.append('dt');
        dt.append('code');
        dt.append('small');
        div.append('dd');
      }),
    )
    // Keep the DOM order the same as the sorted data
    .order();

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

  // Step 2.2 and 2.4: one dot per line, colored by technology
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// Lab 8 Step 1: slider state
let data = await loadData();
let commits = processCommits(data);
let filteredCommits = commits;

let commitProgress = 100;
const timeScale = d3
  .scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);

const slider = document.getElementById('commit-progress');
const timeElement = document.getElementById('commit-time');

// Lab 8 Step 1.2: show only commits up to commitMaxTime everywhere on the page
function updateForMaxTime() {
  timeElement.dateTime = commitMaxTime.toISOString();
  timeElement.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  renderCommitInfo(filteredLines, filteredCommits);
  updateScatterPlot(filteredLines, filteredCommits);
  updateFileDisplay(filteredCommits);
}

// Lab 8 Step 1.1: slider handler
function onTimeSliderChange() {
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  updateForMaxTime();
}

slider.addEventListener('input', onTimeSliderChange);

renderScatterPlot(data, commits);
onTimeSliderChange();

// Lab 8 Step 3.2: one paragraph of text per commit
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((d, i) => {
    const when = d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const fileCount = d3.group(d.lines, (line) => line.file).size;
    const which = i === 0 ? 'my first commit' : `commit ${i + 1}`;
    // loc.csv is a git blame of the current code, so these counts are the
    // lines from this commit that are still on the site today
    return `On ${when}, I made
      <a href="${d.url}" target="_blank">${which}</a>.
      ${d.totalLines} of the lines it wrote are still on the site,
      across ${fileCount} ${fileCount === 1 ? 'file' : 'files'}.`;
  });

// Lab 8 Step 3.3: as each commit's text reaches the middle of the screen,
// show the chart as it was at that commit
function onStepEnter(response) {
  commitMaxTime = response.element.__data__.datetime;
  commitProgress = timeScale(commitMaxTime);
  slider.value = commitProgress;
  updateForMaxTime();
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);
