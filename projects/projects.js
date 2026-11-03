import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
renderProjects(projects, projectsContainer, 'h2');

// Step 1.6: show how many projects there are in the page title
const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle && projects) {
  projectsTitle.textContent = `${projects.length} Projects`;
}

// Lab 5: pie chart of projects per year

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

// Color by year (not by position) so a year keeps its color when the
// chart is redrawn with fewer slices after a search
let colors = d3.scaleOrdinal(d3.schemeTableau10);

let svg = d3.select('#projects-pie-plot');
let legend = d3.select('.legend');

// Step 5.2: -1 means no wedge is selected
let selectedIndex = -1;

// Step 4.4: all the plotting lives in one function so it can run on page
// load and again every time the search changes
function renderPieChart(projectsGiven) {
  // Step 3.1: count projects per year
  let rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let data = rolledData.map(([year, count]) => {
    return { value: count, label: year };
  });

  let sliceGenerator = d3.pie().value((d) => d.value);
  let arcData = sliceGenerator(data);
  let arcs = arcData.map((d) => arcGenerator(d));

  // Clear the old wedges and legend items before drawing new ones
  svg.selectAll('path').remove();
  legend.selectAll('li').remove();
  selectedIndex = -1;

  // Step 5.2 and 5.3: select a wedge, highlight it and its legend item,
  // and show only that year's projects
  function selectWedge(i) {
    selectedIndex = selectedIndex === i ? -1 : i;

    svg
      .selectAll('path')
      .attr('class', (_, idx) => (idx === selectedIndex ? 'selected' : ''))
      .attr('aria-pressed', (_, idx) => idx === selectedIndex);

    legend
      .selectAll('li')
      .attr('class', (_, idx) =>
        idx === selectedIndex ? 'legend-item selected' : 'legend-item',
      );

    if (selectedIndex === -1) {
      renderProjects(projects, projectsContainer, 'h2');
    } else {
      let selectedYear = data[selectedIndex].label;
      let yearProjects = projects.filter((project) => project.year === selectedYear);
      renderProjects(yearProjects, projectsContainer, 'h2');
    }
  }

  // Step 1.4: one path per slice
  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(data[i].label))
      // Keyboard access: wedges can be focused with Tab and picked with Enter or Space
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-pressed', false)
      .attr('aria-label', `${data[i].label}: ${data[i].value} projects`)
      .on('click', () => selectWedge(i))
      .on('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectWedge(i);
        }
      });
  });

  // Step 2.2: legend items, also clickable
  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('style', `--color:${colors(d.label)}`)
      .attr('class', 'legend-item')
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => selectWedge(idx));
  });
}

// Draw the chart once when the page loads
renderPieChart(projects);

// Step 4: search across all project fields, case-insensitive
let query = '';
let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {
  query = event.target.value;

  let filteredProjects = projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });

  renderProjects(filteredProjects, projectsContainer, 'h2');
  renderPieChart(filteredProjects);
});
