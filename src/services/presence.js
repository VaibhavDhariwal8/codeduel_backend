const onlineUsers = new Map();

function markOnline(io, userId) {
  const wasOffline = !onlineUsers.has(userId);

  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);

  if (wasOffline) {
    io.emit("presence:changed", {
      userId,
      online: true,
    });
  }
}

function markOffline(io, userId) {
  const count = (onlineUsers.get(userId) || 1) - 1;

  if (count <= 0) {
    onlineUsers.delete(userId);

    io.emit("presence:changed", {
      userId,
      online: false,
    });
  } else {
    onlineUsers.set(userId, count);
  }
}

function isOnline(userId) {
  return onlineUsers.has(userId);
}

module.exports = {
  markOnline,
  markOffline,
  isOnline,
};
