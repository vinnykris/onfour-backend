const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");

const { getMostRecentUpcomingInfo } = require("./apis/get_concert_data");

mongoose.connect(
  "mongodb+srv://onfour:MONGOon412345!@cluster0.aeiao.mongodb.net/chat_db?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);
mongoose.connection.on("connected", () => {
  0;
  console.log("Mongoose connection established :o");
});
let chatSchema = new mongoose.Schema({
  user: String,
  message: String,
  time: String,
});
let chat = mongoose.model("Message", chatSchema);

const { addUser, removeUser, getUser, getUsersInRoom } = require("./users.js");

const router = require("./router");

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  pingTimeout: 30000,
  pingInterval: 30000,
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
    //emit
    io.to(user.room).emit("message", { user: user.name, text: message });

    //store msg data in obj
    let msgData = new chat({
      user: user.name,
      message: message,
      time: new Date().valueOf(), //valueOf used for easy comparing between messages
    });

    //send data to db
    msgData.save(function (err, msgData) {
      if (err) console.log(err);
      console.log("succuess");
    });

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

    //checks if concert is after current date. If so, defaults to pulling chats 1 min back
    let timelim =
      timenow > recentConcertStart ? recentConcertStart : timenow - 600 * 1000;

    //pull all data from the mongoose database between start of current concert and present time
    let info = await chat.find({ time: { $gte: timelim } }).limit(100);

    //push all messages to the user's chatroom
    info.forEach((message) => {
      socket.emit("message", {
        user: message.user,
        text: message.message,
      });
    });
  } catch (e) {
    console.log(e);
  }
}

server.listen(process.env.PORT || 5000, () =>
  console.log(`Server has started.`)
);
