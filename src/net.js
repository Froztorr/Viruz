// ═══════════════════════════════════════════════════════════
// VIRUZ PET — NETWORK ADAPTER
//
// Everything the game needs from a backend goes through this one
// interface. Right now it is backed by localStorage + generated
// mock rivals, so the game is fully playable offline.
//
// To go online later: implement the same method signatures in a
// FirebaseBackend class and swap ACTIVE at the bottom. No other
// file needs to change.
// ═══════════════════════════════════════════════════════════

const LS_KEY = 'viruz_v5';
const LS_RIVALS = 'viruz_v5_rivals';

// ── Interface (documentation of the contract) ──
//   getProfile()                  → Promise<Profile|null>
//   saveProfile(profile)          → Promise<void>
//   listRivals(limit)             → Promise<RivalSummary[]>
//   getRival(uid)                 → Promise<Rival|null>
//   submitRaid(targetUid, result) → Promise<void>
//   getInbox()                    → Promise<RaidLog[]>
//   markInboxRead()               → Promise<void>
//
// Profile shape (also what a rival exposes publicly):
//   { uid, name, level, power, bitz, team:[PetSummary], defense:{pets,bots} }

function rid() {
  return 'u_' + Math.random().toString(36).slice(2, 10);
}

// Deterministic-ish name generator for mock rivals
const NAME_A = ['Null','Byte','Ghost','Cipher','Vex','Rune','Echo','Krad','Nyx','Orbit','Zeta','Havoc'];
const NAME_B = ['runner','_hax','Wave','Kernel','Shard','Node','Flux','Vault','Trace','Loop'];
function mockName() {
  return NAME_A[Math.floor(Math.random() * NAME_A.length)] +
         NAME_B[Math.floor(Math.random() * NAME_B.length)];
}

export class LocalBackend {
  constructor() {
    this.online = false;
    this.uid = null;
  }

  async init() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try { this.uid = JSON.parse(raw).uid; } catch (e) {}
    }
    if (!this.uid) this.uid = rid();
    return this.uid;
  }

  async getProfile() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async saveProfile(profile) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(profile));
    } catch (e) { /* quota — ignore, memory state still fine */ }
  }

  // Mock rivals are generated once and persisted so the ladder
  // feels stable between sessions.
  async listRivals(limit = 12, myPower = 100) {
    let rivals = [];
    try {
      const raw = localStorage.getItem(LS_RIVALS);
      if (raw) rivals = JSON.parse(raw);
    } catch (e) {}

    if (!rivals.length) {
      rivals = this._generateRivals(14, myPower);
      try { localStorage.setItem(LS_RIVALS, JSON.stringify(rivals)); } catch (e) {}
    }
    return rivals.slice(0, limit);
  }

  async getRival(uid) {
    const rivals = await this.listRivals(99);
    return rivals.find(r => r.uid === uid) || null;
  }

  async submitRaid(targetUid, result) {
    // Offline: record it locally so the player has a history.
    const profile = await this.getProfile();
    if (!profile) return;
    profile.raidHistory = profile.raidHistory || [];
    profile.raidHistory.unshift({
      t: Date.now(), target: targetUid,
      win: result.win, loot: result.loot, log: result.log,
    });
    profile.raidHistory = profile.raidHistory.slice(0, 30);
    await this.saveProfile(profile);
  }

  async getInbox() {
    // Offline: simulate incoming raids occasionally so the defense
    // system has something to show.
    const profile = await this.getProfile();
    return (profile && profile.inbox) || [];
  }

  async markInboxRead() {
    const profile = await this.getProfile();
    if (!profile) return;
    (profile.inbox || []).forEach(m => m.read = true);
    await this.saveProfile(profile);
  }

  _generateRivals(n, myPower) {
    const out = [];
    for (let i = 0; i < n; i++) {
      // Spread rivals from 60% to 180% of the player's power
      const scale = 0.6 + (i / n) * 1.2;
      const power = Math.max(40, Math.floor(myPower * scale));
      out.push({
        uid: rid(),
        name: mockName(),
        level: Math.max(1, Math.floor(power / 28)),
        power,
        defense: {
          // Represented abstractly; the raid resolver only needs power.
          petPower: Math.floor(power * 0.7),
          botPower: Math.floor(power * 0.3),
          botCount: Math.min(3, Math.floor(i / 4)),
        },
        loot: Math.floor(power * 1.4) + 80,
      });
    }
    return out.sort((a, b) => a.power - b.power);
  }
}

// ── Firebase skeleton ──
// Fill this in when you're ready. The rest of the game calls the
// same methods, so nothing else changes.
//
// export class FirebaseBackend {
//   constructor(app) { this.db = getFirestore(app); this.online = true; }
//   async init() {
//     const auth = getAuth();
//     const cred = await signInAnonymously(auth);
//     this.uid = cred.user.uid;
//     return this.uid;
//   }
//   async getProfile() {
//     const snap = await getDoc(doc(this.db, 'players', this.uid));
//     return snap.exists() ? snap.data() : null;
//   }
//   async saveProfile(p) {
//     await setDoc(doc(this.db, 'players', this.uid), p, { merge: true });
//   }
//   async listRivals(limit, myPower) {
//     // Query players near the caller's power bracket
//     const q = query(collection(this.db, 'players'),
//                     where('power', '>=', myPower * 0.6),
//                     where('power', '<=', myPower * 1.8),
//                     orderBy('power'), fbLimit(limit));
//     const snap = await getDocs(q);
//     return snap.docs.map(d => d.data()).filter(r => r.uid !== this.uid);
//   }
//   async submitRaid(targetUid, result) {
//     // Append to the DEFENDER's inbox so they see it next login
//     await addDoc(collection(this.db, 'players', targetUid, 'inbox'), {
//       from: this.uid, t: serverTimestamp(), ...result,
//     });
//   }
//   async getInbox() {
//     const snap = await getDocs(collection(this.db, 'players', this.uid, 'inbox'));
//     return snap.docs.map(d => ({ id: d.id, ...d.data() }));
//   }
// }

export const NET = new LocalBackend();
