const mongoose = require("mongoose");

const connectDb = async () => {
    try {
        // await mongoose.connect("mongodb://localhost:27017/mern");
        await mongoose.connect("mongodb+srv://ashhad12009:NvYnk6I7qAAWGVjx@data.ubuai.mongodb.net/?retryWrites=true&w=majority&appName=data");
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Connection Failed", error);
        process.exit(1);
    }
};
module.exports = connectDb;