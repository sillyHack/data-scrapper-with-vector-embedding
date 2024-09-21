const { chromium } = require("playwright");
const fs = require("fs/promises");

(async () => {
	const browser = await chromium.launch(); // Or 'firefox' or 'webkit'.
	const page = await browser.newPage();
	await page.goto("https://nextjs.org/docs");

	// get the nav element
	const nav = await page.$("nav.styled-scrollbar");
	if (!nav) {
		console.log("nav element not found");
		return;
	}

	// get all the 'a' elements
	const links = await nav.$$("a");

	const urls = await Promise.all(
		links.map(async (link) => {
			const href = await link.getAttribute("href");
			
			return href;
		})
	);

	for (const url of urls) {
        console.log("👀 Visising", url);
		await page.goto(`https://nextjs.org${url}`);

		const content = await page.$eval(
			"div.prose.prose-vercel",
			(el) => el.textContent
		);
		if (!content) {
			continue;
		}

        const encodedUrlForFileName = `https://nextjs.org${url}`
            .replace("https://", "")
            .replace(/\//g, "_")
            .replace(/\./g, "");
		const filepath = `./data/nextjs/${encodedUrlForFileName}.txt`;

        console.log("📝 Saving to", filepath);
		await fs.writeFile(filepath, content);
	}

	await browser.close();
})();
