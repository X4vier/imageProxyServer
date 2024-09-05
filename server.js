import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  cors({
    origin: "http://localhost:9090",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-api-key",
      "anthropic-version",
    ],
  })
);

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-key, anthropic-version"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.get("/", (req, res) => {
  res.send("proxy server ready");
});

// Function to generate a random filename
function generateRandomFilename() {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "image_";
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result + ".png";
}

// Simple queue implementation
class Queue {
  constructor(concurrency = 10) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  push(task) {
    this.queue.push(task);
    this.next();
  }

  next() {
    while (this.running < this.concurrency && this.queue.length) {
      const task = this.queue.shift();
      this.running++;
      task(() => {
        this.running--;
        this.next();
      });
    }
  }
}

const downloadQueue = new Queue(10);

app.get("/fetch-image", async (req, res) => {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    return res.status(400).json({ error: "No URL provided" });
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      maxContentLength: 10 * 1024 * 1024, // 10 MB limit
    });

    const contentType = response.headers["content-type"];
    res.setHeader("Content-Type", contentType);
    res.send(response.data);
  } catch (error) {
    console.error("Fetch image error:", error);
    if (axios.isAxiosError(error)) {
      if (error.response) {
        res.status(error.response.status).json({ error: error.message });
      } else if (error.request) {
        res
          .status(500)
          .json({ error: "No response received from the image server" });
      } else {
        res.status(500).json({ error: "Error setting up the request" });
      }
    } else {
      res.status(500).json({ error: "An unexpected error occurred" });
    }
  }
});

app.post("/proxy/v1/images/generations", async (req, res) => {
  try {
    const response = await axios({
      method: "post",
      url: "https://api.openai.com/v1/images/generations",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers["authorization"],
      },
      data: req.body,
    });
    res.json(response.data);
  } catch (error) {
    console.log("Proxy error:");
    console.log(JSON.stringify(error.response.data, null, 2));
    res.status(500).json({ error: error.message });
  }
});

app.post("/proxy/v1/messages", async (req, res) => {
  try {
    const response = await axios({
      method: "post",
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": req.headers["x-api-key"],
        "anthropic-version": req.headers["anthropic-version"],
      },
      data: req.body,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    res.json(response.data);
  } catch (error) {
    console.log("Anthropic Proxy error:");
    console.log(JSON.stringify(error.response?.data || error.message, null, 2));
    res
      .status(error.response?.status || 500)
      .json({ error: error.response?.data || error.message });
  }
});

app.post("/proxy/flux/generate", async (req, res) => {
  try {
    const { fluxApiKey, params } = req.body;

    console.log("Params are");
    console.log(params);

    const response = await axios({
      method: "post",
      url: "https://fal.run/fal-ai/flux/dev",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${fluxApiKey}`,
      },
      data: params,
    });

    // Pass through the Flux API response
    res.json(response.data);
  } catch (error) {
    console.log("Flux API Proxy error:");
    console.log(JSON.stringify(error.response?.data || error.message, null, 2));
    res
      .status(error.response?.status || 500)
      .json({ error: error.response?.data || error.message });
  }
});

// New route to proxy image requests if needed
app.get("/proxy/image", async (req, res) => {
  try {
    const imageUrl = req.query.url;
    const response = await axios({
      method: "get",
      url: imageUrl,
      responseType: "stream",
    });

    response.data.pipe(res);
  } catch (error) {
    console.log("Image Proxy error:");
    console.log(JSON.stringify(error.response?.data || error.message, null, 2));
    res
      .status(error.response?.status || 500)
      .json({ error: error.response?.data || error.message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
