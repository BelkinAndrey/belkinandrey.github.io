const PROJECTS_URL = "data/projects.json";
const SVG_NS = "http://www.w3.org/2000/svg";

const LINK_LABELS = {
    page: "Page",
    source: "Source",
    youtube: "YouTube"
};

const LINK_ICONS = {
    page: "M6 3.5h8l4 4v13H6v-17z M14 3.5V8h4 M9 13h6 M9 16h6",
    source: "M8 9l-4 3 4 3 M16 9l4 3-4 3 M14 5l-4 14",
    youtube: "M10 9.75 15 12l-5 2.25v-4.5z M21 12c0 2.1-.2 3.5-.55 4.25-.23.49-.62.88-1.11 1.11-1.14.54-7.34.54-7.34.54s-6.2 0-7.34-.54a2 2 0 0 1-1.11-1.11C3.2 15.5 3 14.1 3 12s.2-3.5.55-4.25c.23-.49.62-.88 1.11-1.11C5.8 6.1 12 6.1 12 6.1s6.2 0 7.34.54c.49.23.88.62 1.11 1.11.35.75.55 2.15.55 4.25z"
};

export function getProjectLinks(project) {
    if (!project || !Array.isArray(project.links)) {
        return [];
    }

    return project.links.filter((link) => link && link.url);
}

export function getPrimaryLink(project) {
    const links = getProjectLinks(project);
    return links.find((link) => link.primary) || links.find((link) => link.type === "page") || links[0] || null;
}

export function getLinkLabel(link) {
    return link.label || LINK_LABELS[link.type] || "Link";
}

export function getLinkIconPath(type) {
    return LINK_ICONS[type] || null;
}

export function isExternalUrl(url) {
    return /^https?:\/\//i.test(url);
}

function getLinkTypeClass(type) {
    const safeType = String(type || "link").toLowerCase().replace(/[^a-z0-9-]/g, "");
    return safeType || "link";
}

function applyLinkAttributes(anchor, url) {
    anchor.href = url;

    if (isExternalUrl(url)) {
        anchor.target = "_blank";
        anchor.rel = "noopener";
    }
}

function createLinkIcon(type, documentRef) {
    const iconPath = getLinkIconPath(type);

    if (!iconPath) {
        return null;
    }

    const svg = documentRef.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "project-link-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const path = documentRef.createElementNS(SVG_NS, "path");
    path.setAttribute("d", iconPath);
    svg.append(path);

    return svg;
}

function createPreview(project, primaryLink, documentRef) {
    const preview = documentRef.createElement(primaryLink ? "a" : "div");
    preview.className = primaryLink ? "preview preview-link" : "preview";

    if (primaryLink) {
        applyLinkAttributes(preview, primaryLink.url);
        preview.setAttribute("aria-label", `Open ${project.title}`);
    }

    const previewUrl = project.preview || project.fallbackPreview;

    if (previewUrl) {
        const image = documentRef.createElement("img");
        image.src = previewUrl;
        image.alt = project.previewAlt || `${project.title} preview`;

        if (project.fallbackPreview && project.fallbackPreview !== previewUrl) {
            image.addEventListener("error", () => {
                if (image.dataset.fallbackApplied) {
                    return;
                }

                image.dataset.fallbackApplied = "true";
                image.src = project.fallbackPreview;
            });
        }

        preview.append(image);
        return preview;
    }

    const placeholder = documentRef.createElement("div");
    placeholder.className = "preview-placeholder";
    placeholder.textContent = project.title;
    preview.append(placeholder);

    return preview;
}

function createTitle(project, primaryLink, documentRef) {
    const title = documentRef.createElement("h3");

    if (!primaryLink) {
        title.textContent = project.title;
        return title;
    }

    const titleLink = documentRef.createElement("a");
    titleLink.className = "project-title-link";
    titleLink.textContent = project.title;
    applyLinkAttributes(titleLink, primaryLink.url);
    title.append(titleLink);

    return title;
}

function createTags(tags, documentRef) {
    if (!Array.isArray(tags) || tags.length === 0) {
        return null;
    }

    const list = documentRef.createElement("ul");
    list.className = "project-tags";
    list.setAttribute("aria-label", "Project tags");

    tags.forEach((tag) => {
        const item = documentRef.createElement("li");
        item.textContent = tag;
        list.append(item);
    });

    return list;
}

function createProjectLinks(project, links, documentRef) {
    if (links.length === 0) {
        return null;
    }

    const nav = documentRef.createElement("nav");
    nav.className = "project-links";
    nav.setAttribute("aria-label", `${project.title} links`);

    links.forEach((link) => {
        const anchor = documentRef.createElement("a");
        anchor.className = `project-link project-link-${getLinkTypeClass(link.type)}`;
        applyLinkAttributes(anchor, link.url);

        const icon = createLinkIcon(link.type, documentRef);
        const label = documentRef.createElement("span");
        label.textContent = getLinkLabel(link);

        if (icon) {
            anchor.append(icon);
        }

        anchor.append(label);
        nav.append(anchor);
    });

    return nav;
}

export function createProjectCard(project, documentRef = document) {
    const links = getProjectLinks(project);
    const primaryLink = getPrimaryLink(project);
    const card = documentRef.createElement("article");
    card.className = "project-card";

    card.append(createPreview(project, primaryLink, documentRef));

    const info = documentRef.createElement("div");
    info.className = "project-info";
    info.append(createTitle(project, primaryLink, documentRef));

    if (project.description) {
        const description = documentRef.createElement("p");
        description.textContent = project.description;
        info.append(description);
    }

    const tags = createTags(project.tags, documentRef);
    if (tags) {
        info.append(tags);
    }

    const projectLinks = createProjectLinks(project, links, documentRef);
    if (projectLinks) {
        info.append(projectLinks);
    }

    card.append(info);

    return card;
}

export async function loadProjects(url = PROJECTS_URL) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Unable to load projects: ${response.status}`);
    }

    return response.json();
}

export function renderProjects(projects, grid, documentRef = document) {
    const fragment = documentRef.createDocumentFragment();

    projects.forEach((project) => {
        fragment.append(createProjectCard(project, documentRef));
    });

    grid.replaceChildren(fragment);
    grid.removeAttribute("aria-busy");
}

function renderProjectsError(grid, documentRef) {
    const message = documentRef.createElement("p");
    message.className = "projects-status";
    message.textContent = "Projects could not be loaded.";
    grid.replaceChildren(message);
    grid.removeAttribute("aria-busy");
}

async function initProjects() {
    const grid = document.querySelector("[data-projects-grid]");

    if (!grid) {
        return;
    }

    try {
        const projects = await loadProjects();
        renderProjects(projects, grid);
    } catch (error) {
        console.error(error);
        renderProjectsError(grid, document);
    }
}

if (typeof document !== "undefined") {
    initProjects();
}
