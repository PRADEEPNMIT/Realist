import express from "express";
import morgan from "morgan";
import cors from "cors";
import mongoose from "mongoose";
import { DATABASE } from "./config.js";
import authRoutes from "./routes/auth.js";

const app = express();
//db
mongoose
  .connect(DATABASE)
  .then(() => {
    console.log("DB is connected");
  })
  .catch((err) => {
    console.log("Error in conncection ", err);
  });

// middleware

app.use(cors());
app.use(express.json());

app.use(morgan("dev"));
app.use("/api", authRoutes);

app.listen(8000, () => {
  console.log("Running on 8000 port");
});
