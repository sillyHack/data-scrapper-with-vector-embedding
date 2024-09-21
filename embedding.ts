import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import { TextFile, TextFileWithToken } from "./types";
dotenv.config();
import fs from "fs/promises";
import { Tiktoken } from "@dqbd/tiktoken";
import cl100k_base from "@dqbd/tiktoken/encoders/cl100k_base.json";

const databaseUrl = process.env.DATABASE_URL;
const openaiKey = process.env.OPENAI_KEY;

if (!databaseUrl || !openaiKey) {
	throw new Error("Missing environment variables");
}

const openai = new OpenAI({
	apiKey: openaiKey,
});

const sql = neon(databaseUrl);

const encoding = new Tiktoken(
	cl100k_base.bpe_ranks,
	cl100k_base.special_tokens,
	cl100k_base.pat_str
);

const MAX_TOKENS = 500;

(async function main() {
	const FOLDER = "nextjs";

	// Step 1 : Récupérer tous les textes avec leur nom de fichier.
	const files = await cache_withFile(
		() => processFiles(FOLDER),
		"processed/texts.json"
	);
	// console.log(files[0], files[1], files[2]);

	// Step 2 : Tokenizer tous les textes.
	const textTokens = await cache_withFile(
		() => tiktokenizer(files),
		"processed/texts_tokens.json"
	);

	// Step 3 : Raccourcir tous les textes pour éviter qu'ils soient trop longs.
    const textsTokensShortened = await cache_withFile(
        () => splitTexts(textTokens),
        "processed/textsTokensShortened.json"
    );
	// const textOriginal = textTokens[0].text;
	// const textShortened = textsTokensShortened.map((t: any) => t.text).join(". ");

	// Step 4 : Intégrer tous les textes (embed).
	// Step 5 : Sauvegarder nos embeddings dans la base de données.
})();

async function cache_withFile<T>(func: () => Promise<T>, filepath: string) {
	try {
		await fs.access(filepath);

		const data = await fs.readFile(filepath, "utf8");

		return JSON.parse(data);
	} catch (error) {
		const data = await func();

		await fs.writeFile(filepath, JSON.stringify(data));

		return data;
	}
}

async function processFiles(folder: string): Promise<TextFile[]> {
	const directoryPath = `./data/${folder}`;
	let files: TextFile[] = [];

	const entries = await fs.readdir(directoryPath, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isFile()) {
			const filepath = directoryPath + "/" + entry.name;
			const data = await fs.readFile(filepath, "utf8");

			files.push({
				filepath: entry.name,
				text: data,
			});
		}
	}

	return files;
}

const tiktokenizer = async (files: TextFile[]): Promise<TextFileWithToken[]> => {
	const textFilesTokens: TextFileWithToken[] = [];

	for (const file of files) {
		const token = encoding.encode(file.text);

		textFilesTokens.push({
			...file,
			token,
		});
	}

	return textFilesTokens;
};

async function splitTexts(textFilesWithToken: TextFileWithToken[]): Promise<TextFile[]> {
	const shortenedTextFiles: TextFile[] = [];

	for (const textFile of textFilesWithToken) {
		if (textFile.token.length > MAX_TOKENS) {
			const chunks = await splitTextToMany(textFile);
			shortenedTextFiles.push(...chunks);
		} else {
			shortenedTextFiles.push(textFile);
		}
	}

	return shortenedTextFiles;
}

async function splitTextToMany(text: TextFileWithToken): Promise<TextFile[]> {
	const sentences = text.text
		.split(". ")
		.map((sentence) => ({
			text: sentence + ". ",
			numberTokens: encoding.encode(sentence).length,
		}))
		.reduce((acc, sentence) => {
			// if the sentence is too long, split it by \n
			if (sentence.numberTokens > MAX_TOKENS) {
				const sentences = sentence.text.split("\n").map((sentence) => ({
					text: sentence + "\n",
					numberTokens: encoding.encode(sentence).length,
				}));

				// check if new sentences is to long, if it's the case, cut every space
				const sentencesTooLong = sentences.filter(
					(sentence) => sentence.numberTokens > MAX_TOKENS
				);

				if (sentencesTooLong.length > 0) {
					const word = sentence.text.split(" ").map((sentence) => ({
						text: sentence + " ",
						numberTokens: encoding.encode(sentence).length,
					}));

					return [...acc, ...word];
				}

				return [...acc, ...sentences];
			}
			return [...acc, sentence];
		}, [] as { text: string; numberTokens: number }[]);

	const chunks: TextFile[] = [];

	let tokensSoFar = 0;
	let currentChunks: TextFileWithToken[] = [];

	for (const sentence of sentences) {
		const numberToken = sentence.numberTokens;

		if (tokensSoFar + numberToken > MAX_TOKENS) {
			const chunkText = currentChunks.map((c) => c.text).join("");
			chunks.push({
				filepath: text.filepath,
				text: chunkText,
			});

			currentChunks = [];
			tokensSoFar = 0;
		}

		currentChunks.push({
			filepath: text.filepath,
			text: sentence.text,
			token: new Uint32Array(),
		});

		tokensSoFar += numberToken;
	}

	if (currentChunks.length > 0) {
		const chunkText = currentChunks.map((c) => c.text).join("");
		if (chunkText.length > 100) {
			chunks.push({
				filepath: text.filepath,
				text: chunkText,
			});
		}
	}

	return chunks;
}
