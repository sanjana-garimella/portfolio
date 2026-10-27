console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

// Step 3: Automatic navigation menu

// Detect whether we're running locally or on GitHub Pages so internal
// links work in both places (GitHub Pages serves the site from /portfolio/).
const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/' // Local server
    : '/portfolio/'; // GitHub Pages repo name

let pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'cv/', title: 'CV' },
  { url: 'contact/', title: 'Contact' },
  { url: 'https://github.com/sanjana-garimella', title: 'GitHub' },
];

let nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let { url, title } = p;

  url = !url.startsWith('http') ? BASE_PATH + url : url;

  let a = document.createElement('a');
  a.href = url;
  a.textContent = title;
  nav.append(a);

  // Highlight the link to the current page
  a.classList.toggle(
    'current',
    a.host === location.host && a.pathname === location.pathname,
  );

  // Open external links in a new tab
  if (a.host !== location.host) {
    a.target = '_blank';
  }
}

// Step 4: Dark mode switcher

document.body.insertAdjacentHTML(
  'afterbegin',
  `
	<label class="color-scheme">
		Theme:
		<select>
			<option value="light dark">Automatic</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	</label>`,
);

let select = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

// Restore the saved preference (if any) on page load
if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', function (event) {
  let colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
});

// Step 5: Better contact form (optional)

let form = $$('form')[0];

form?.addEventListener('submit', function (event) {
  event.preventDefault();

  let data = new FormData(form);
  let url = form.action + '?';

  for (let [name, value] of data) {
    url += `${name}=${encodeURIComponent(value)}&`;
  }

  location.href = url;
});

// Lab 4, Step 1.2: load a JSON file (or API response) and return the parsed data

export async function fetchJSON(url) {
  try {
    // Fetch the JSON file from the given URL
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
  }
}

// Lab 4, Step 1.4: render a list of projects into a container

// Image and link paths in projects.json are relative to the site root,
// so the same data works from the home page and the projects page.
function sitePath(path) {
  if (!path || path.startsWith('http') || path.startsWith('/')) return path;
  return BASE_PATH + path;
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects: containerElement is not a valid DOM element');
    return;
  }

  // Only allow real heading tags; fall back to h2 for anything else
  if (!/^h[1-6]$/.test(headingLevel)) {
    console.warn(`renderProjects: "${headingLevel}" is not a heading tag, using h2`);
    headingLevel = 'h2';
  }

  // Clear old content so projects are not added twice
  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects to show yet.</p>';
    return;
  }

  for (let project of projects) {
    const article = document.createElement('article');

    const title = project.title ?? 'Untitled project';
    const heading = project.url
      ? `<a href="${sitePath(project.url)}">${title}</a>`
      : title;
    const image = sitePath(project.image ?? 'images/empty.svg');

    article.innerHTML = `
      <${headingLevel}>${heading}</${headingLevel}>
      <img src="${image}" alt="${title}">
      <p>${project.description ?? ''}</p>
    `;

    containerElement.appendChild(article);
  }
}

// Lab 4, Step 3.2: get public profile data from the GitHub API

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
