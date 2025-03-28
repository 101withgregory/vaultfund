const asyncHandler = require("express-async-handler");
const Group = require("../models/groupModel");
const User = require("../models/userModel");
const Transaction = require("../models/transactionModel");
// ✅ Create a New Group
const createGroup = asyncHandler(async (req, res) => {
  const { name, description, visibility, minContribution, withdrawalLimit } = req.body;

  const groupExists = await Group.findOne({ name });
  if (groupExists) {
    res.status(400);
    throw new Error("Group already exists");
  }

  const group = await Group.create({
    name,
    description,
    visibility,
    minContribution,
    withdrawalLimit,
    createdBy: req.user._id,
    members: [{ user: req.user._id, role: "admin" }],
    totalFunds: 0,
    transactions: [],
  });

  if (group) {
    res.status(201).json(group);
  } else {
    res.status(400);
    throw new Error("Invalid group data");
  }
});

// ✅ Get All Groups
const getGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find().populate("members.user", "name email");
  res.json(groups);
});

// ✅ Get Single Group by ID
const getGroupById = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id).populate("members.user", "name email");
  
  if (group) {
    res.json(group);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Update Group Details
const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (group) {
    if (group.createdBy.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error("Not authorized to edit this group");
    }

    group.name = req.body.name || group.name;
    group.description = req.body.description || group.description;
    group.visibility = req.body.visibility || group.visibility;
    group.minContribution = req.body.minContribution || group.minContribution;
    group.withdrawalLimit = req.body.withdrawalLimit || group.withdrawalLimit;

    const updatedGroup = await group.save();
    res.json(updatedGroup);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Delete a Group
const deleteGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (group) {
    await group.remove();
    res.json({ message: "Group deleted" });
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Add a Member to the Group
const addMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    const isMember = group.members.find((m) => m.user.toString() === userId);
    if (isMember) {
      res.status(400);
      throw new Error("User is already a member");
    }

    group.members.push({ user: userId, role: "member" });
    await group.save();
    res.json(group);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Remove a Member from the Group
const removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    group.members = group.members.filter((m) => m.user.toString() !== userId);
    await group.save();
    res.json(group);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Deposit Funds into Group
const depositFunds = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    if (amount < group.minContribution) {
      res.status(400);
      throw new Error(`Minimum contribution is ${group.minContribution}`);
    }

    const newTransaction = await Transaction.create({
      transactionType: "deposit",
      amount,
      user: req.user._id,
      group: group._id,
    });
    group.transactions.push(newTransaction._id);

    group.totalFunds += amount;
    await group.save();

    res.json(group);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// ✅ Withdraw Funds from Group
const withdrawFunds = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    if (amount > group.withdrawalLimit) {
      res.status(400);
      throw new Error(`Maximum withdrawal is ${group.withdrawalLimit}`);
    }

    if (amount > group.totalFunds) {
      res.status(400);
      throw new Error("Insufficient funds");
    }

    const newTransaction = await Transaction.create({
      transactionType: "withdrawal",
      amount,
      user: req.user._id,
      group: group._id,
    });

    group.transactions.push(newTransaction._id);

    group.totalFunds -= amount;
    await group.save();

    res.json(group);
  } else {
    res.status(404);
    throw new Error("Group not found");
  }
});

// leave the group
const leaveGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    res.status(404);
    throw new Error("Group not found");
  }

  const userId = req.user._id.toString();

  // Check if the user is a member of the group
  const member = group.members.find((m) => m.user.toString() === userId);
  if (!member) {
    res.status(400);
    throw new Error("You are not a member of this group");
  }

  // Prevent leaving if the user is the last admin
  if (member.role === "admin") {
    const remainingAdmins = group.members.filter((m) => m.role === "admin");
    if (remainingAdmins.length === 1) {
      res.status(400);
      throw new Error("You cannot leave the group as the last admin");
    }
  }

  // Remove the user from the group
  group.members = group.members.filter((m) => m.user.toString() !== userId);
  await group.save();

  res.json({ message: "You have left the group" });
});

//transfer funds
const transferFunds = asyncHandler(async (req, res) => {
  const { fromGroupId, toGroupId, amount } = req.body;

  if (!fromGroupId || !toGroupId || !amount) {
    res.status(400);
    throw new Error("All fields are required");
  }

  if (amount <= 0) {
    res.status(400);
    throw new Error("Amount must be greater than zero");
  }

  const fromGroup = await Group.findById(fromGroupId);
  const toGroup = await Group.findById(toGroupId);

  if (!fromGroup || !toGroup) {
    res.status(404);
    throw new Error("Group not found");
  }

  // Ensure the user is an admin of both groups
  const isAdminFrom = fromGroup.members.some(
    (m) => m.user.toString() === req.user._id.toString() && m.role === "admin"
  );

  const isAdminTo = toGroup.members.some(
    (m) => m.user.toString() === req.user._id.toString() && m.role === "admin"
  );

  if (!isAdminFrom || !isAdminTo) {
    res.status(403);
    throw new Error("You must be an admin of both groups to transfer funds");
  }

  if (fromGroup.totalFunds < amount) {
    res.status(400);
    throw new Error("Insufficient funds in the source group");
  }

    // ✅ Create withdrawal transaction for source group
    const withdrawTransaction = await Transaction.create({
      transactionType: "withdrawal",
      amount,
      user: req.user._id,
      group: fromGroup._id,
    });
  
    fromGroup.transactions.push(withdrawTransaction._id);
    fromGroup.totalFunds -= amount;
    await fromGroup.save();
  
    // ✅ Create deposit transaction for destination group
    const depositTransaction = await Transaction.create({
      transactionType: "deposit",
      amount,
      user: req.user._id,
      group: toGroup._id,
    });
  
    toGroup.transactions.push(depositTransaction._id);
    toGroup.totalFunds += amount;
    await toGroup.save();
  
    res.json({
      message: `Transferred ${amount} from ${fromGroup.name} to ${toGroup.name}`,
      fromGroup,
      toGroup,
    });
  
});


module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  depositFunds,
  withdrawFunds,
  leaveGroup,
  transferFunds
};
