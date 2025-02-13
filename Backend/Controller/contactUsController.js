const Info = require("../Model/contactSchema");

const FeedBackForm = async (req, res) => {
  try {
    const { name, email, message, nameOfEvent } = req.body;

    const feedBackCreated = await Info.create({
      name,
      email,
      message,
      nameOfEvent
    });

    return res.status(201).json({
      success: "Feedback Sent successfully",
      contactDetails: feedBackCreated,
    });
  } catch (error) {
    console.error("Submission error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const GetUserComments = async (req, res) => {
  try {
    const comments = await Info.find();
    res.status(200).json(comments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Error fetching comments" });
  }
};

const GetUserCommentsByName = async (req, res,) => {
  const { name } = req.params;
  try {
    const Usercomments = await Info.find({ name });
    res.status(200).json(Usercomments);
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ message: "Error fetching comments" });
  }
};

const DeleteComment = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await Info.findByIdAndDelete(id); // Use the correct model name
    if (!result) {
      return res.status(404).json({ message: "Comment not found" });
    }
    res
      .status(200)
      .json({ message: "Comment deleted successfully", deletedComment: result });
  } catch (error) {
    console.error("Error deleting Comment:", error);
    res
      .status(500)
      .json({ message: "Failed to delete Comment", error: error.message });
  }
};

module.exports = { FeedBackForm, GetUserComments, DeleteComment, GetUserCommentsByName };
