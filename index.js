const express = require("express");
const socketio = require("socket.io");
const http = require("http");
const cors = require("cors");
const mongoose = require('mongoose');

mongoose.connect("mongodb+srv://onfour:MONGOon412345!@cluster0.aeiao.mongodb.net/chat_db?retryWrites=true&w=majority" , {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.connection.on('connected', ()={
  console.log("Mongoose connection established :o");
});
let chatSchema = new mongoose.Schema({
  user: String,
  message: String,
  time: String
});
let chatDB = mongoose.model('Message', chatSchema);

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

let msgData;

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

    msgData = {
      user : user.name,
      message : message,
      time : new Date()
    };

    msgData.save(function (err, msgData){
      if (err) console.log(err);
      console.log("succuess");
    })

    //insert into mongodb
    chatDB.collection.insert()

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

server.listen(process.env.PORT || 5000, () =>
  console.log(`Server has started.`)
);
