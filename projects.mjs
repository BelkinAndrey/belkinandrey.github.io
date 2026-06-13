const PROJECTS_URL = "data/projects.json";

const LINK_LABELS = {
    page: "Page",
    source: "Source",
    youtube: "YouTube"
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
        anchor.textContent = getLinkLabel(link);
        applyLinkAttributes(anchor, link.url);
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
