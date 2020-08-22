const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");

const { getMostRecentUpcomingInfo } = require("./apis/get_concert_data");


const setMongooseConnection = (mode, mongoose) => {
  mongoose.disconnect();
  switch(mode){
    case "production":
      mongoose.connect(
        "mongodb+srv://onfour:MONGOon412345!@cluster0.aeiao.mongodb.net/chat_db?retryWrites=true&w=majority",
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        }
      );
      console.log("prod");
      break;
    case "development":
      mongoose.connect(
        "mongodb+srv://onfour:MONGOon412345!@cluster0.aeiao.mongodb.net/chat_db_development?retryWrites=true&w=majority",
        {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        }
      );
      console.log("dev");
      break;
    default:
      console.log("fail to connect");
      break;
  }
}
//default to normal chat
mongoose.connect(
  "mongodb+srv://onfour:MONGOon412345!@cluster0.aeiao.mongodb.net/chat_db?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

mongoose.connection.on("connected", () => {
  console.log("Mongoose connection established :o");
});
let chatSchema = new mongoose.Schema({
  user: String,
  message: String,
  time: String,
});
let chat = mongoose.model("Message", chatSchema);

const { addUser, removeUser, getUser, getUsersInRoom } = require("./users.js");

// const router = require("./router");

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  pingTimeout: 30000,
  pingInterval: 30000,
});

io.set('origins', '*:*');
io.origins('*:*');

const path = require("path");
const router = express.Router(); //router

let mongodb_mode = "production";

router.get("/", (req, res) => {
  // res.send({ response: "server is up and running" }).status(200);
  res.sendFile(path.join(__dirname + "/index.html"));
});

router.get("/status", (req, res) => {
  res.send({ response: "server is up and running. Using db "+mongodb_mode+" "}).status(200);
});

router.get("/production", (req, res) => {
  res.send({ response: "production mode enabled" }).status(200);
  mongodb_mode = "production";
  setMongooseConnection(mongodb_mode, mongoose);
});

router.get("/development", (req, res) => {
  res.send({ response: "development" }).status(200);
  mongodb_mode = "development";
  setMongooseConnection(mongodb_mode, mongoose);
});

app.use(router);
app.use(cors());

io.on("connect", (socket) => {
  socket.on("join", ({ name, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name, room });

    if (error) return callback(error);

    socket.join(user.room);

    if (name !== "GUEST") {
      socket.emit("message", {
        user: "admin",
        text: `Welcome to ${user.room}, ${user.name}!`,
      });
    } else {
      socket.emit("message", {
        user: "admin",
        text: `You have joined ${user.room} as a guest. Please log in to send messages.`,
      });
    }
    //call to async function
    chatFiller(socket);

    //admin join msg
    // socket.broadcast.to(user.room).emit("message", {
    //   user: "admin",
    //   text: `${user.name} has joined!`,
    // });

    io.to(user.room).emit("roomData", {
      room: user.room,
      users: getUsersInRoom(user.room),
    });

    callback();
  });

  socket.on("sendMessage", (message, callback) => {
    const { error, user } = getUser(socket.id);

    if (error) {
      return callback(error);
    }

    let currentTime = (new Date()).valueOf();

    console.log(currentTime);

    //emit
    io.to(user.room).emit("message", { user: user.name, text: message, timeStamp: currentTime, likes: 0 });

    //store msg data in obj
    let msgData = new chat({
      user: user.name,
      message: message,
      time: currentTime, //valueOf used for easy comparing between messages
    });

    //send data to db
    msgData.save(function (err, msgData) {
      if (err) console.log(err);
      console.log("succuess");
    });

    callback();
  });

  socket.on("likeMessage", (data, callback) => {
    let user = data.user;
    let text = data.text;
    let timeStamp = data.timeStamp;
    let socketId = data.socketId;
    console.log(timeStamp);
    io.emit("like", { user, text, timeStamp, socketId });
    // io.to(userAuth.room).emit("like", { user, text });

    callback();
  });

  socket.on("unlikeMessage", (data, callback) => {
    let user = data.user;
    let text = data.text;
    let timeStamp = data.timeStamp;
    let socketId = data.socketId;
    console.log(timeStamp);
    io.emit("unlike", { user, text, timeStamp, socketId });
    // io.to(userAuth.room).emit("like", { user, text });

    callback();
  });

  socket.on("disconnect", (reason) => {
    const user = removeUser(socket.id);
    console.log(reason);
    if (user) {
      io.to(user.room).emit("roomData", {
        room: user.room,
        users: getUsersInRoom(user.room),
      });
    }
  });
});
//fills the chat with messages from previous users
async function chatFiller(socket, user) {
  try {
    //pulls most recent concert and gets start data in valueOf (raw milliseconds)
    let recent = await getMostRecentUpcomingInfo();
    let recentConcertStart = new Date(
      recent.date + " " + recent.time
    ).valueOf();

    let timenow = new Date().valueOf();

    //checks if concert is after current date. If so, defaults to pulling chats 30 min back
    let timelim =
      timenow > recentConcertStart ? recentConcertStart : timenow - 1800 * 1000;

    //pull all data from the mongoose database between start of current concert and present time
    let info = await chat
      .find({ time: { $gte: timelim } })
      .sort({ time: 1 })
      .limit(100)
      .hint("time_index");
    //push all messages to the user's chatroom
    info.forEach((message) => {
      socket.emit("message", {
        user: message.user,
        text: message.message,
        timeStamp: message.time,
        likes: 0
      });
    });
  } catch (e) {
    console.log(e);
  }
}

server.listen(process.env.PORT || 5000, () =>
  console.log(`Server has started.`)
);
