import Gun from 'gun';
import 'gun/sea';

// Initialize GunDB with peer connection
const gun = Gun({
  peers: ['/gun'], // Proxied to server
  localStorage: true,
  radisk: true,
});

// Get SEA module
const SEA = Gun.SEA;

// User instance for SEA authentication
const user = gun.user();

export { gun, user, SEA };
export default gun;
