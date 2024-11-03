const { chromium } = require("playwright");
const fs = require("fs/promises");
const TurndownService = require('turndown');

(async () => {
	const browser = await chromium.launch(); // Or 'firefox' or 'webkit'.
	const page = await browser.newPage();
	await page.goto("https://vuejs.org/guide/introduction.html");

	// get the nav element
	const nav = await page.$("nav#VPSidebarNav");
	if (!nav) {
		console.log("nav element not found");
		return;
	}

	// get all the 'a' elements
	const links = await nav.$$("div.group a");

	const urls = await Promise.all(
		links.map(async (link) => {
			const href = await link.getAttribute("href");
			
			return href;
		})
	);

    const turndownService = new TurndownService();
	for (const url of urls) {
        console.log("👀 Visising", url);
		await page.goto(`https://vuejs.org${url}`);

		const content = await page.$eval(
			"div.vt-doc div",
			(el) => el.textContent
		);
		if (!content) {
            continue;
		}
        // const markdownContent = turndownService.turndown(content);

        const encodedUrlForFileName = `https://vuejs.org${url}`
            .replace("https://", "")
            .replace(/\//g, "_")
            .replace(/\./g, "");
		const filepath = `./data/vuejs/${encodedUrlForFileName}.txt`;

        console.log("📝 Saving to", filepath);
		await fs.writeFile(filepath, content);
	}

	await browser.close();
})();
