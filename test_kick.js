const io = require('socket.io-client');
(async () => {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('http://localhost:3000/api/qr');
  const data = await res.json();
  const token = data.token;
  
  const desktop = io('http://localhost:3000', { auth: { token, role: 'desktop' } });
  
  desktop.on('connect', () => {
      console.log('Desktop connected');
      desktop.emit('request_users');
  });
  
  let targetId;
  desktop.on('users_update', (d) => {
      console.log('Desktop received users_update:', JSON.stringify(d, null, 2));
      const phone = d.active.find(u => u.role === 'phone');
      if (phone && !targetId) {
          targetId = phone.id;
          console.log('Kicking phone...', targetId);
          desktop.emit('admin_action', { action: 'kick', targetId });
      }
  });

  setTimeout(() => {
      const phone = io('http://localhost:3000', { auth: { token, role: 'phone' } });
      phone.on('connect', () => console.log('Phone connected'));
      phone.on('disconnect', () => {
          console.log('Phone disconnected');
          setTimeout(() => process.exit(0), 1000);
      });
  }, 1000);
})();
