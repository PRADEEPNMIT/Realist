import * as config from "../config.js";
import jwt from "jsonwebtoken";
import { emailTemplate } from "../helpers/email.js";
import { hashPassword, comparePassword } from "../helpers/auth.js";
import User from "../models/user.js";
import { nanoid } from "nanoid";
import validator from "email-validator";

export const welcome = (req, res) => {
  res.json({
    data: "Hello from NodeJS API in udemy",
  });
};

export const preRegister = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!validator.validate(email)) {
      return res.json({ error: "A valid email is required" });
    }
    if (!password) {
      return res.json({ err: "Password is mandatory" });
    }
    if (password && password.length < 6) {
      return res.json({ error: "Password should be atleast 6 characters" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ error: "Email is taken" });
    }
    const token = jwt.sign({ email, password }, config.JWT_SECRET, {
      expiresIn: "1h",
    });

    config.AWS_SES.sendEmail(
      emailTemplate(
        email,
        `<p> Please click the link below to activate your account </p>
      <a href="${config.CLIENT_URL}/auth/account-activate/${token}"> Activate my account </a>`,
        config.EMAIL_REPLY_TO,
        `ACTIVATE YOUR ACCOUNT`
      ),
      (err, data) => {
        if (err) {
          console.log("Error ", err);
          return res.json({ ok: false });
        } else {
          res.header("Access-Control-Allow-Origin", "*");
          res.header(
            "Access-Control-Allow-Headers",
            "Origin, X-Requested-With, Content-Type, Accept"
          );
          console.log(res.headers);
          return res.json({ ok: true });
        }
      }
    );
  } catch (err) {
    console.log(err);
    return res.json({
      error: "Something went wrong. Try again",
      err: err,
    });
  }
};

export const register = async (req, res) => {
  try {
    const { email, password } = jwt.verify(req.body.token, config.JWT_SECRET);
    const hashedPassword = await hashPassword(password);
    const user = await new User({
      username: nanoid(6),
      email,
      password: hashedPassword,
    }).save();

    return res.json(tokenAndUserResponse(user));
  } catch (err) {
    console.log("Error occured in POST /register route ", err);
    return res.json({ error: "Some error occurred" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    //Find user by email
    const user = await User.findOne({ email });
    //compare password
    const match = await comparePassword(password, user.password);
    if (!match) {
      return res.json({ error: "Wrong password" });
    }
    //Create JWT and refresh token
    return res.json(tokenAndUserResponse(user));
  } catch (error) {
    console.log("Error occured in POST /login route ", error);
    return res.json({ error: "Some error occurred" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ error: "Could not find the user with email :", email });
    }
    const resetCode = nanoid(6);
    user.resetCode = resetCode;
    user.save();
    const token = jwt.sign({ resetCode }, config.JWT_SECRET, {
      expiresIn: "1h",
    });
    config.AWS_SES.sendEmail(
      emailTemplate(
        email,
        `<p>Please click the link below to access your account</p>
                <a href="${config.CLIENT_URL}/auth/access-account/${token}"> Access my account</a>
      `,
        config.EMAIL_REPLY_TO,
        `Access your account`
      ),
      (err, data) => {
        if (err) {
          return res.json({ ok: false });
        } else {
          return res.json({ ok: true });
        }
      }
    );
  } catch (err) {
    console.log(err);
    return res.json({ error: "Error occured in forgot password route" });
  }
};

export const accessAccount = async (req, res) => {
  try {
    const { resetCode } = jwt.verify(req.body.resetCode, config.JWT_SECRET);
    const user = await User.findOneAndUpdate({ resetCode }, { resetCode: "" });
    return res.json(tokenAndUserResponse(user));
  } catch (err) {
    return res.json({ error: err });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const { _id } = jwt.verify(req.headers.refresh_token, config.JWT_SECRET);
    const user = await User.find({ _id });
    const token = jwt.sign({ _id: user._id }, config.JWT_SECRET, {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign({ _id: user._id }, config.JWT_SECRET, {
      expiresIn: "7d",
    });

    user.password = undefined;
    user.resetCode = undefined;

    return res.json({
      token,
      refreshToken,
      user,
    });
  } catch (err) {
    console.log(err);
    return res.status(403).json({ error: "Refresh token failed" });
  }
};

export const currentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.password = undefined;
    user.resetCode = undefined;
    res.json(user);
  } catch (err) {
    console.log(err);
    return res.status(403).json({ error: "Unauthorised" });
  }
};

export const publicProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (user) {
      user.password = undefined;
      user.resetCode = undefined;
      return res.json({ user: user });
    }
  } catch (err) {
    console.log(err);
    return res.status(404).json({ err: "User not found" });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.json({ err: "Password is required" });
    }
    if (password && password.length < 6) {
      return res.json({ err: "Password should have 6 characters" });
    }

    const user = await User.findByIdAndUpdate(req.user._id, {
      password: await hashPassword(password),
    });

    res.json({ ok: "true" });
  } catch (err) {
    console.log(err);
    return res.json({});
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, req.body, {
      new: true,
    });
    user.password = undefined;
    user.resetCode = undefined;
    res.json(user);
  } catch (err) {
    if (err.codeName === "DuplicateKey") {
      return res.json({ err: "Username is taken" });
    }
    console.log(err);
  }
};

const tokenAndUserResponse = (user) => {
  const token = jwt.sign({ _id: user._id }, config.JWT_SECRET, {
    expiresIn: "1h",
  });

  const refreshToken = jwt.sign({ _id: user._id }, config.JWT_SECRET, {
    expiresIn: "7d",
  });

  user.password = undefined;
  user.resetCode = undefined;

  return {
    token,
    refreshToken,
    user,
  };
};
