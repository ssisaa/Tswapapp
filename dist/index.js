var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminSettings: () => adminSettings,
  adminUsers: () => adminUsers,
  insertAdminSettingsSchema: () => insertAdminSettingsSchema,
  insertAdminUserSchema: () => insertAdminUserSchema,
  insertStakingRecordSchema: () => insertStakingRecordSchema,
  insertTokenSchema: () => insertTokenSchema,
  insertTransactionSchema: () => insertTransactionSchema,
  stakingRecords: () => stakingRecords,
  tokens: () => tokens,
  transactions: () => transactions
});
import { pgTable, text, serial, integer, boolean, timestamp, decimal, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isFounder: boolean("is_founder").default(false),
  founderPublicKey: text("founder_public_key"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLogin: timestamp("last_login")
});
var adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  liquidityContributionPercentage: decimal("liquidity_contribution_percentage").notNull().default("33"),
  liquidityRewardsRateDaily: decimal("liquidity_rewards_rate_daily").notNull().default("0.05"),
  liquidityRewardsRateWeekly: decimal("liquidity_rewards_rate_weekly").notNull().default("0.35"),
  liquidityRewardsRateMonthly: decimal("liquidity_rewards_rate_monthly").notNull().default("1.5"),
  stakeRateDaily: decimal("stake_rate_daily").notNull().default("0.1"),
  stakeRateHourly: decimal("stake_rate_hourly").notNull().default("0.004"),
  stakeRatePerSecond: decimal("stake_rate_per_second").notNull().default("0.000001"),
  harvestThreshold: decimal("harvest_threshold").notNull().default("1.0"),
  // Adding these new fields to store threshold values that aren't supported by the Solana program
  stakeThreshold: decimal("stake_threshold").notNull().default("10.0"),
  unstakeThreshold: decimal("unstake_threshold").notNull().default("10.0"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => adminUsers.id)
});
var tokens = pgTable("tokens", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull(),
  supply: text("supply").notNull(),
  mintAuthority: text("mint_authority"),
  freezeAuthority: text("freeze_authority")
});
var insertTokenSchema = createInsertSchema(tokens).pick({
  address: true,
  symbol: true,
  name: true,
  decimals: true,
  supply: true,
  mintAuthority: true,
  freezeAuthority: true
});
var transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  signature: text("signature").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  fromToken: text("from_token").notNull(),
  toToken: text("to_token").notNull(),
  fromAmount: text("from_amount").notNull(),
  toAmount: text("to_amount").notNull(),
  fee: text("fee").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  status: text("status").notNull(),
  isSwap: boolean("is_swap").notNull()
});
var insertTransactionSchema = createInsertSchema(transactions).pick({
  signature: true,
  walletAddress: true,
  fromToken: true,
  toToken: true,
  fromAmount: true,
  toAmount: true,
  fee: true,
  timestamp: true,
  status: true,
  isSwap: true
});
var insertAdminUserSchema = createInsertSchema(adminUsers).pick({
  username: true,
  password: true,
  isFounder: true,
  founderPublicKey: true
});
var insertAdminSettingsSchema = createInsertSchema(adminSettings).pick({
  liquidityContributionPercentage: true,
  liquidityRewardsRateDaily: true,
  liquidityRewardsRateWeekly: true,
  liquidityRewardsRateMonthly: true,
  stakeRateDaily: true,
  stakeRateHourly: true,
  stakeRatePerSecond: true,
  harvestThreshold: true,
  stakeThreshold: true,
  // Added new field
  unstakeThreshold: true,
  // Added new field
  updatedBy: true
});
var stakingRecords = pgTable("staking_records", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  stakedAmount: decimal("staked_amount").notNull().default("0"),
  startTimestamp: bigint("start_timestamp", { mode: "number" }).notNull(),
  // Using bigint for JS timestamp milliseconds
  lastHarvestTime: bigint("last_harvest_time", { mode: "number" }),
  harvestedRewards: decimal("harvested_rewards").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertStakingRecordSchema = createInsertSchema(stakingRecords).pick({
  walletAddress: true,
  stakedAmount: true,
  startTimestamp: true,
  harvestedRewards: true
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq } from "drizzle-orm";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import session from "express-session";
import connectPg from "connect-pg-simple";
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
var PostgresSessionStore = connectPg(session);
var DatabaseStorage = class {
  sessionStore;
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
      tableName: "session"
    });
    this.initializeDefaultSettings();
  }
  async initializeDefaultSettings() {
    try {
      const settings = await this.getAdminSettings();
      if (!settings) {
        await db.insert(adminSettings).values({
          liquidityContributionPercentage: "33",
          liquidityRewardsRateDaily: "0.05",
          liquidityRewardsRateWeekly: "0.35",
          liquidityRewardsRateMonthly: "1.5",
          stakeRateDaily: "0.1",
          stakeRateHourly: "0.004",
          stakeRatePerSecond: "0.000001",
          harvestThreshold: "1.0",
          // Add the new fields that were missing
          stakeThreshold: "10.0",
          unstakeThreshold: "10.0"
        });
        console.log("Initial admin settings created successfully");
      }
    } catch (error) {
      console.error("Error initializing default settings:", error);
    }
  }
  async getAdminUser(id) {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return user;
  }
  async getAdminUserByUsername(username) {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return user;
  }
  async createAdminUser(insertUser) {
    const hashedPassword = await hashPassword(insertUser.password);
    const [user] = await db.insert(adminUsers).values({
      ...insertUser,
      password: hashedPassword
    }).returning();
    return user;
  }
  async verifyAdminPassword(username, password) {
    const user = await this.getAdminUserByUsername(username);
    if (!user) return null;
    const isValid = await comparePasswords(password, user.password);
    return isValid ? user : null;
  }
  async updateAdminLastLogin(id) {
    await db.update(adminUsers).set({ lastLogin: /* @__PURE__ */ new Date() }).where(eq(adminUsers.id, id));
  }
  async checkFounderWallet(publicKey) {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.founderPublicKey, publicKey));
    return user && user.isFounder ? user : null;
  }
  async getAdminSettings() {
    const [settings] = await db.select().from(adminSettings);
    return settings;
  }
  async updateAdminSettings(settings, adminId) {
    const [updated] = await db.update(adminSettings).set({
      ...settings,
      updatedAt: /* @__PURE__ */ new Date(),
      updatedBy: adminId
    }).returning();
    return updated;
  }
  // Staking functionality
  async saveStakingData(data) {
    const sanitizedWalletAddress = data.walletAddress.trim();
    const sanitizedAmount = Math.max(0, data.stakedAmount);
    let timestampSeconds;
    try {
      let timestampMs = Date.now();
      if (typeof data.startTimestamp === "number") {
        timestampMs = data.startTimestamp;
      } else if (typeof data.startTimestamp === "string") {
        timestampMs = new Date(data.startTimestamp).getTime();
      }
      timestampSeconds = Math.floor(timestampMs / 1e3);
      const now = Math.floor(Date.now() / 1e3);
      if (timestampSeconds > now + 60) {
        console.warn("Timestamp is in the future, using current time");
        timestampSeconds = now;
      }
      const jan2020 = 1577836800;
      if (timestampSeconds < jan2020) {
        console.warn("Timestamp is too old, using current time");
        timestampSeconds = now;
      }
    } catch (e) {
      console.error("Invalid timestamp format:", e);
      timestampSeconds = Math.floor(Date.now() / 1e3);
    }
    const existingRecord = await this.getStakingData(sanitizedWalletAddress);
    try {
      if (existingRecord) {
        const [updatedRecord] = await db.update(stakingRecords).set({
          stakedAmount: sanitizedAmount.toString(),
          startTimestamp: timestampSeconds,
          // Now storing in seconds
          harvestedRewards: data.harvestableRewards ? Math.max(0, data.harvestableRewards).toString() : "0",
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(stakingRecords.walletAddress, sanitizedWalletAddress)).returning();
        return updatedRecord;
      } else {
        const [newRecord] = await db.insert(stakingRecords).values({
          walletAddress: sanitizedWalletAddress,
          stakedAmount: sanitizedAmount.toString(),
          startTimestamp: timestampSeconds,
          // Now storing in seconds
          lastHarvestTime: timestampSeconds,
          // Now storing in seconds
          harvestedRewards: data.harvestableRewards ? Math.max(0, data.harvestableRewards).toString() : "0"
        }).returning();
        return newRecord;
      }
    } catch (error) {
      console.error("Database operation failed:", error);
      throw new Error("Unable to process staking data. Please try again.");
    }
  }
  async getStakingData(walletAddress) {
    const sanitizedWalletAddress = walletAddress ? walletAddress.trim() : "";
    if (!sanitizedWalletAddress) {
      return null;
    }
    try {
      const [record] = await db.select().from(stakingRecords).where(eq(stakingRecords.walletAddress, sanitizedWalletAddress));
      if (!record) return null;
      const settings = await this.getAdminSettings();
      return {
        id: record.id,
        walletAddress: record.walletAddress,
        stakedAmount: record.stakedAmount,
        startTimestamp: record.startTimestamp,
        lastHarvestTime: record.lastHarvestTime,
        harvestedRewards: record.harvestedRewards,
        updatedAt: record.updatedAt,
        // Include admin settings so frontend can calculate rewards
        currentSettings: settings ? {
          id: settings.id,
          stakeRateDaily: settings.stakeRateDaily,
          stakeRateHourly: settings.stakeRateHourly,
          stakeRatePerSecond: settings.stakeRatePerSecond,
          harvestThreshold: settings.harvestThreshold,
          updatedAt: settings.updatedAt
        } : null
      };
    } catch (error) {
      console.error("Error retrieving staking data:", error);
      throw new Error("Unable to retrieve staking information");
    }
  }
  async removeStakingData(walletAddress) {
    const sanitizedWalletAddress = walletAddress.trim();
    try {
      const existingRecord = await this.getStakingData(sanitizedWalletAddress);
      if (!existingRecord) {
        throw new Error("No staking record found for this wallet");
      }
      await db.delete(stakingRecords).where(eq(stakingRecords.walletAddress, sanitizedWalletAddress));
    } catch (error) {
      console.error("Error removing staking data:", error);
      throw new Error("Unable to process unstaking request. Please try again.");
    }
  }
  async harvestRewards(walletAddress) {
    const sanitizedWalletAddress = walletAddress.trim();
    const currentTimeSeconds = Math.floor(Date.now() / 1e3);
    try {
      await db.update(stakingRecords).set({
        harvestedRewards: "0",
        lastHarvestTime: currentTimeSeconds,
        // Now in seconds instead of milliseconds
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(stakingRecords.walletAddress, sanitizedWalletAddress));
    } catch (error) {
      console.error("Error during reward harvest:", error);
      throw new Error("Unable to harvest rewards. Please try again.");
    }
  }
};
var storage = new DatabaseStorage();

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "solana-token-swap-admin-secret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1e3,
      // 1 day
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    }
  };
  app2.set("trust proxy", 1);
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.verifyAdminPassword(username, password);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        await storage.updateAdminLastLogin(user.id);
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await storage.getAdminUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
  const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  app2.post("/api/admin/login", passport.authenticate("local"), (req, res) => {
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
  app2.post("/api/admin/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });
  app2.get("/api/admin/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
  app2.post("/api/admin/register", async (req, res) => {
    try {
      const { username, password, isFounder, founderPublicKey } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const existingUser = await storage.getAdminUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }
      const user = await storage.createAdminUser({
        username,
        password,
        isFounder: isFounder || false,
        founderPublicKey: founderPublicKey || null
      });
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error during login", error: err.message });
        }
        const { password: password2, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Error registering admin user:", error);
      res.status(500).json({
        message: "Failed to register admin user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/admin/settings", async (req, res) => {
    try {
      const settings = await storage.getAdminSettings();
      res.json(settings || {});
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({
        message: "Failed to fetch admin settings",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.put("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const {
        liquidityContributionPercentage,
        liquidityRewardsRateDaily,
        liquidityRewardsRateWeekly,
        liquidityRewardsRateMonthly,
        stakeRateDaily,
        stakeRateHourly,
        stakeRatePerSecond,
        harvestThreshold,
        stakeThreshold,
        // Added new fields 
        unstakeThreshold
        // Added new fields
      } = req.body;
      const adminId = req.user.id;
      const updated = await storage.updateAdminSettings({
        liquidityContributionPercentage,
        liquidityRewardsRateDaily,
        liquidityRewardsRateWeekly,
        liquidityRewardsRateMonthly,
        stakeRateDaily,
        stakeRateHourly,
        stakeRatePerSecond,
        harvestThreshold,
        stakeThreshold,
        // Added new fields
        unstakeThreshold,
        // Added new fields
        updatedBy: adminId
      }, adminId);
      res.json(updated);
    } catch (error) {
      console.error("Error updating admin settings:", error);
      res.status(500).json({
        message: "Failed to update admin settings",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.post("/api/admin/verify-wallet", async (req, res) => {
    try {
      const { publicKey } = req.body;
      if (!publicKey) {
        return res.status(400).json({ message: "Public key is required" });
      }
      const adminUser = await storage.checkFounderWallet(publicKey);
      if (!adminUser) {
        return res.status(403).json({ message: "This wallet is not registered as a founder" });
      }
      req.login(adminUser, (err) => {
        if (err) {
          return res.status(500).json({ message: "Error during login", error: err.message });
        }
        storage.updateAdminLastLogin(adminUser.id);
        const { password, ...userWithoutPassword } = adminUser;
        res.json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Error verifying wallet:", error);
      res.status(500).json({
        message: "Failed to verify wallet",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  return { isAuthenticated };
}

// server/routes.ts
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import { WebSocketServer, WebSocket } from "ws";

// client/src/lib/lruCache.ts
var LRUCache = class {
  cache;
  maxSize;
  ttl;
  /**
   * Create a new LRU cache
   * @param maxSize Maximum number of items to store
   * @param ttl Time to live in milliseconds (default: 5 minutes)
   */
  constructor(maxSize, ttl = 5 * 60 * 1e3) {
    this.cache = /* @__PURE__ */ new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }
  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or undefined if not found or expired
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      return void 0;
    }
    const now = Date.now();
    if (now - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return void 0;
    }
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }
  /**
   * Add or update a value in the cache
   * @param key The cache key
   * @param value The value to cache
   */
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  /**
   * Remove a value from the cache
   * @param key The cache key
   * @returns True if the item was found and removed
   */
  delete(key) {
    return this.cache.delete(key);
  }
  /**
   * Clear all items from the cache
   */
  clear() {
    this.cache.clear();
  }
  /**
   * Get the number of items in the cache
   */
  size() {
    return this.cache.size;
  }
  /**
   * Check if the cache contains a non-expired item with the given key
   * @param key The cache key
   */
  has(key) {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  /**
   * Clean up expired entries from the cache
   * @returns Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let count = 0;
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.ttl) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
  /**
   * Get all valid (non-expired) keys in the cache
   */
  keys() {
    this.cleanup();
    return Array.from(this.cache.keys());
  }
  /**
   * Get all valid (non-expired) values in the cache
   */
  values() {
    this.cleanup();
    return Array.from(this.cache.values()).map((item) => item.value);
  }
};

// server/routes.ts
var CLUSTER = "devnet";
var RPC_ENDPOINTS = [
  clusterApiUrl(CLUSTER),
  "https://rpc-devnet.helius.xyz/?api-key=15319bf6-5525-43d0-8cdc-17f54a2c452a",
  "https://rpc.ankr.com/solana_devnet"
];
var YOT_TOKEN_ADDRESS = "2EmUMo6kgmospSja3FUpYT3Yrps2YjHJtU9oZohr5GPF";
var YOS_TOKEN_ADDRESS = "GcsjAVWYaTce9cpFLm2eGhRjZauvtSP3z3iMrZsrMW8n";
var POOL_AUTHORITY = "7m7RAFhzGXr4eYUWUdQ8U6ZAuZx6qRG8ZCSvr6cHKpfK";
var POOL_SOL_ACCOUNT = "7xXdF9GUs3T8kCsfLkaQ72fJtu137vwzQAyRd9zE7dHS";
var SolanaConnectionManager = class _SolanaConnectionManager {
  static instance;
  connections = [];
  currentIndex = 0;
  requestCount = 0;
  cache = {
    poolData: new LRUCache(10, 3e4),
    // 30 seconds
    accountInfo: new LRUCache(100, 1e4),
    // 10 seconds
    tokenAccounts: new LRUCache(100, 15e3)
    // 15 seconds
  };
  constructor() {
    RPC_ENDPOINTS.forEach((endpoint) => {
      this.connections.push(new Connection(endpoint, "confirmed"));
    });
    setInterval(() => {
      this.cache.poolData.cleanup();
      this.cache.accountInfo.cleanup();
      this.cache.tokenAccounts.cleanup();
    }, 6e4);
  }
  static getInstance() {
    if (!_SolanaConnectionManager.instance) {
      _SolanaConnectionManager.instance = new _SolanaConnectionManager();
    }
    return _SolanaConnectionManager.instance;
  }
  getConnection() {
    this.requestCount++;
    this.currentIndex = (this.currentIndex + 1) % this.connections.length;
    return this.connections[this.currentIndex];
  }
  getCache(type) {
    return this.cache[type];
  }
  getRequestCount() {
    return this.requestCount;
  }
};
var connectionManager = SolanaConnectionManager.getInstance();
var getConnection = () => connectionManager.getConnection();
async function registerRoutes(app2) {
  app2.get("/api/pool-data", async (req, res) => {
    try {
      const cacheKey = "pool_data";
      const poolDataCache = connectionManager.getCache("poolData");
      const cachedData = poolDataCache.get(cacheKey);
      if (cachedData) {
        return res.json(cachedData);
      }
      const conn = getConnection();
      const solBalance = await conn.getBalance(new PublicKey(POOL_SOL_ACCOUNT)) / LAMPORTS_PER_SOL;
      const yotTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(YOT_TOKEN_ADDRESS),
        new PublicKey(POOL_AUTHORITY)
      );
      const yotAccount = await getAccount(conn, yotTokenAccount);
      const yotMint = await getMint(conn, new PublicKey(YOT_TOKEN_ADDRESS));
      const YOT_DECIMALS = yotMint.decimals;
      const yotBalance = Number(yotAccount.amount) / Math.pow(10, YOT_DECIMALS);
      const yosTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(YOS_TOKEN_ADDRESS),
        new PublicKey(POOL_AUTHORITY)
      );
      let yosBalance = 0;
      try {
        const yosAccount = await getAccount(conn, yosTokenAccount);
        const yosMint = await getMint(conn, new PublicKey(YOS_TOKEN_ADDRESS));
        const YOS_DECIMALS = yosMint.decimals;
        yosBalance = Number(yosAccount.amount) / Math.pow(10, YOS_DECIMALS);
      } catch (error) {
        console.warn("Error fetching YOS balance, using 0:", error);
      }
      const totalValue = solBalance * 148.35;
      const poolData = {
        sol: solBalance,
        yot: yotBalance,
        yos: yosBalance,
        totalValue,
        timestamp: Date.now()
      };
      poolDataCache.set(cacheKey, poolData);
      res.json(poolData);
    } catch (error) {
      console.error("Error fetching pool data:", error);
      const poolDataCache = connectionManager.getCache("poolData");
      const cachedData = poolDataCache.get("pool_data");
      if (cachedData) {
        console.log("Returning stale cached data due to error");
        return res.json({
          ...cachedData,
          stale: true
        });
      }
      res.status(500).json({ error: "Failed to fetch pool data" });
    }
  });
  const { isAuthenticated } = setupAuth(app2);
  app2.get("/api/token/:address", async (req, res) => {
    try {
      const { address } = req.params;
      let publicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid token address"
        });
      }
      const conn = getConnection();
      const mintInfo = await getMint(conn, publicKey);
      res.json({
        address,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals),
        mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null
      });
    } catch (error) {
      console.error("Error fetching token info:", error);
      res.status(500).json({
        message: "Failed to fetch token information",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/pool", async (req, res) => {
    try {
      const conn = getConnection();
      const poolSolAccount = new PublicKey(POOL_SOL_ACCOUNT);
      const solBalance = await conn.getBalance(poolSolAccount);
      const poolAuthority = new PublicKey(POOL_AUTHORITY);
      const yotTokenMint = new PublicKey(YOT_TOKEN_ADDRESS);
      const yotTokenAccount = await getAssociatedTokenAddress(
        yotTokenMint,
        poolAuthority
      );
      let yotBalance = 0;
      try {
        const tokenAccountInfo = await getAccount(conn, yotTokenAccount);
        const mintInfo = await getMint(conn, yotTokenMint);
        yotBalance = Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
        console.error("Error getting YOT balance:", error);
      }
      res.json({
        authority: POOL_AUTHORITY,
        solAccount: POOL_SOL_ACCOUNT,
        solBalance: solBalance / LAMPORTS_PER_SOL,
        yotBalance
      });
    } catch (error) {
      console.error("Error fetching pool info:", error);
      res.status(500).json({
        message: "Failed to fetch pool information",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/transactions/:address", async (req, res) => {
    try {
      const { address } = req.params;
      const { limit = "10" } = req.query;
      let publicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid address"
        });
      }
      const conn = getConnection();
      const transactions2 = await conn.getSignaturesForAddress(
        publicKey,
        { limit: parseInt(limit) }
      );
      const transactionDetails = await Promise.all(
        transactions2.map(async (tx) => {
          try {
            const txDetails = await conn.getTransaction(tx.signature, {
              maxSupportedTransactionVersion: 0
            });
            let isSwap = false;
            let fromToken = "";
            let toToken = "";
            let fromAmount = 0;
            let toAmount = 0;
            let fee = 0;
            if (txDetails) {
              const poolSolAccountStr = POOL_SOL_ACCOUNT;
              const accountKeys = txDetails.transaction.message.accountKeys.map(
                (key) => key.toBase58()
              );
              isSwap = accountKeys.includes(poolSolAccountStr);
              if (isSwap) {
                const hasYotTransfer = txDetails.meta?.logMessages?.some(
                  (log2) => log2.includes("Transfer") && log2.includes(YOT_TOKEN_ADDRESS)
                );
                if (hasYotTransfer) {
                  fromToken = accountKeys.indexOf(poolSolAccountStr) < accountKeys.indexOf(address) ? "YOT" : "SOL";
                  toToken = fromToken === "SOL" ? "YOT" : "SOL";
                  fee = 5e-6;
                }
              }
            }
            return {
              signature: tx.signature,
              timestamp: tx.blockTime || 0,
              status: tx.confirmationStatus,
              isSwap,
              fromToken,
              toToken,
              fromAmount,
              toAmount,
              fee
            };
          } catch (error) {
            console.error(`Error fetching transaction ${tx.signature}:`, error);
            return null;
          }
        })
      );
      res.json(transactionDetails.filter(Boolean));
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({
        message: "Failed to fetch transactions",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/balances/:address", async (req, res) => {
    try {
      const { address } = req.params;
      let publicKey;
      try {
        publicKey = new PublicKey(address);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid wallet address"
        });
      }
      const cacheKey = `balances_${address}`;
      const accountCache = connectionManager.getCache("accountInfo");
      const cachedBalances = accountCache.get(cacheKey);
      if (cachedBalances) {
        return res.json(cachedBalances);
      }
      const conn = getConnection();
      const solBalance = await conn.getBalance(publicKey);
      const yotTokenMint = new PublicKey(YOT_TOKEN_ADDRESS);
      const yotTokenAccount = await getAssociatedTokenAddress(
        yotTokenMint,
        publicKey
      );
      let yotBalance = 0;
      try {
        const tokenAccountInfo = await getAccount(conn, yotTokenAccount);
        const mintInfo = await getMint(conn, yotTokenMint);
        yotBalance = Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
      }
      const yosTokenMint = new PublicKey(YOS_TOKEN_ADDRESS);
      const yosTokenAccount = await getAssociatedTokenAddress(
        yosTokenMint,
        publicKey
      );
      let yosBalance = 0;
      try {
        const tokenAccountInfo = await getAccount(conn, yosTokenAccount);
        const mintInfo = await getMint(conn, yotTokenMint);
        yosBalance = Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
      } catch (error) {
      }
      const solPrice = 148.35;
      const solUsdValue = solBalance / LAMPORTS_PER_SOL * solPrice;
      const balanceData = {
        sol: solBalance / LAMPORTS_PER_SOL,
        solUsd: solUsdValue,
        yot: yotBalance,
        yos: yosBalance,
        timestamp: Date.now()
      };
      accountCache.set(cacheKey, balanceData);
      res.json(balanceData);
    } catch (error) {
      console.error("Error fetching balances:", error);
      res.status(500).json({
        message: "Failed to fetch wallet balances",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/staking/info", async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({ message: "Wallet address is required" });
      }
      if (wallet.length < 32 || wallet.length > 44) {
        return res.status(400).json({
          message: "Invalid wallet address format",
          error: "Please provide a valid wallet address"
        });
      }
      const sanitizedWallet = wallet.trim();
      try {
        const stakingData = await storage.getStakingData(sanitizedWallet);
        if (!stakingData) {
          return res.json({
            stakedAmount: 0,
            rewardsEarned: 0,
            startTimestamp: null,
            harvestedRewards: 0
          });
        }
        const safeResponse = {
          stakedAmount: stakingData.stakedAmount || 0,
          rewardsEarned: stakingData.rewardsEarned || 0,
          startTimestamp: stakingData.startTimestamp || null,
          harvestedRewards: stakingData.harvestedRewards || 0,
          // Include only the admin settings needed for calculations
          currentSettings: stakingData.currentSettings ? {
            stakeRatePerSecond: stakingData.currentSettings.stakeRatePerSecond,
            harvestThreshold: stakingData.currentSettings.harvestThreshold
          } : null
        };
        res.json(safeResponse);
      } catch (dbError) {
        console.error("Database error fetching staking data:", dbError);
        return res.status(500).json({
          message: "Unable to retrieve staking information",
          error: "Please try again later"
        });
      }
    } catch (error) {
      console.error("Error fetching staking info:", error);
      res.status(500).json({
        message: "Failed to fetch staking information",
        error: "An unexpected error occurred"
      });
    }
  });
  app2.post("/api/staking/stake", async (req, res) => {
    try {
      const { walletAddress, stakedAmount, startTimestamp } = req.body;
      if (!walletAddress || !stakedAmount || !startTimestamp) {
        return res.status(400).json({ message: "Missing required staking data" });
      }
      if (walletAddress.length < 32 || walletAddress.length > 44) {
        return res.status(400).json({
          message: "Invalid wallet address format",
          error: "Please provide a valid wallet address"
        });
      }
      const sanitizedWalletAddress = walletAddress.trim();
      let sanitizedAmount;
      try {
        sanitizedAmount = typeof stakedAmount === "number" ? stakedAmount : parseFloat(stakedAmount.toString());
        if (isNaN(sanitizedAmount) || sanitizedAmount <= 0) {
          throw new Error("Invalid amount");
        }
      } catch (err) {
        return res.status(400).json({
          message: "Invalid amount provided",
          error: "Please provide a valid number for the staked amount"
        });
      }
      let timestampInSeconds;
      try {
        const timestampInMs = typeof startTimestamp === "number" ? startTimestamp : new Date(startTimestamp).getTime();
        timestampInSeconds = Math.floor(timestampInMs / 1e3);
        const now = Math.floor(Date.now() / 1e3);
        const oneYearAgo = now - 365 * 24 * 60 * 60;
        if (timestampInSeconds > now + 60) {
          throw new Error("Timestamp cannot be in the future");
        }
        if (timestampInSeconds < oneYearAgo) {
          throw new Error("Timestamp is too far in the past");
        }
      } catch (err) {
        return res.status(400).json({
          message: "Invalid timestamp",
          error: "Please provide a valid timestamp"
        });
      }
      try {
        await storage.saveStakingData({
          walletAddress: sanitizedWalletAddress,
          stakedAmount: sanitizedAmount,
          startTimestamp: timestampInSeconds
          // Now using seconds instead of milliseconds
        });
        res.json({
          success: true,
          message: "Staking data saved successfully",
          data: {
            wallet: sanitizedWalletAddress.substring(0, 6) + "..." + sanitizedWalletAddress.substring(sanitizedWalletAddress.length - 4),
            // Show partial wallet for security
            amount: sanitizedAmount,
            timestamp: new Date(timestampInSeconds * 1e3).toISOString()
            // Convert back to ISO for display
          }
        });
      } catch (dbError) {
        console.error("Database operation failed:", dbError);
        return res.status(500).json({
          message: "Failed to save staking data",
          error: "An error occurred while processing your request"
          // Generic error for security
        });
      }
    } catch (error) {
      console.error("Error saving staking data:", error);
      res.status(500).json({
        message: "Failed to save staking data",
        error: "An unexpected error occurred"
      });
    }
  });
  app2.post("/api/staking/unstake", async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({ message: "Wallet address is required" });
      }
      if (wallet.length < 32 || wallet.length > 44) {
        return res.status(400).json({
          message: "Invalid wallet address format",
          error: "Please provide a valid wallet address"
        });
      }
      const sanitizedWallet = wallet.trim();
      try {
        const stakingData = await storage.getStakingData(sanitizedWallet);
        if (!stakingData || stakingData.stakedAmount <= 0) {
          return res.status(400).json({
            message: "No staked tokens found",
            error: "You do not have any tokens staked from this wallet"
          });
        }
        await storage.removeStakingData(sanitizedWallet);
        res.json({
          success: true,
          message: "Successfully unstaked",
          // Provide some data to confirm what was unstaked
          unstaked: {
            amount: stakingData.stakedAmount,
            wallet: sanitizedWallet.substring(0, 6) + "..." + sanitizedWallet.substring(sanitizedWallet.length - 4)
            // Show partial wallet for security
          }
        });
      } catch (dbError) {
        console.error("Database error during unstaking:", dbError);
        return res.status(500).json({
          message: "Unable to process unstaking request",
          error: "Please try again later"
        });
      }
    } catch (error) {
      console.error("Error unstaking:", error);
      res.status(500).json({
        message: "Failed to unstake",
        error: "An unexpected error occurred"
      });
    }
  });
  app2.post("/api/staking/harvest", async (req, res) => {
    try {
      const { wallet } = req.query;
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({ message: "Wallet address is required" });
      }
      if (wallet.length < 32 || wallet.length > 44) {
        return res.status(400).json({
          message: "Invalid wallet address format",
          error: "Please provide a valid wallet address"
        });
      }
      const sanitizedWallet = wallet.trim();
      try {
        const stakingData = await storage.getStakingData(sanitizedWallet);
        if (!stakingData || stakingData.stakedAmount <= 0) {
          return res.status(400).json({
            message: "No staked tokens found",
            error: "You do not have any tokens staked from this wallet"
          });
        }
        const adminSettings2 = await storage.getAdminSettings();
        const harvestThreshold = adminSettings2?.harvestThreshold ? parseFloat(adminSettings2.harvestThreshold.toString()) : 100;
        if (stakingData.rewardsEarned < harvestThreshold) {
          return res.status(400).json({
            message: "Below harvest threshold",
            error: `You need at least ${harvestThreshold} YOS tokens to harvest. You currently have ${stakingData.rewardsEarned} YOS.`
          });
        }
        await storage.harvestRewards(sanitizedWallet);
        res.json({
          success: true,
          message: "Successfully harvested rewards",
          // Provide some data to confirm what was harvested
          harvested: {
            amount: stakingData.rewardsEarned,
            wallet: sanitizedWallet.substring(0, 6) + "..." + sanitizedWallet.substring(sanitizedWallet.length - 4)
            // Show partial wallet for security
          }
        });
      } catch (dbError) {
        console.error("Database error during harvesting:", dbError);
        return res.status(500).json({
          message: "Unable to process harvesting request",
          error: "Please try again later"
        });
      }
    } catch (error) {
      console.error("Error harvesting rewards:", error);
      res.status(500).json({
        message: "Failed to harvest rewards",
        error: "An unexpected error occurred"
      });
    }
  });
  const httpServer = createServer(app2);
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    // Add proper error handling for the server
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      // Don't use threshold for small packages
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10
    }
  });
  wss.on("error", (error) => {
    console.error("WebSocket server error:", error);
  });
  const clients = /* @__PURE__ */ new Map();
  wss.on("connection", (ws2, req) => {
    const clientId = Math.random().toString(36).substring(2, 10);
    const ip = req.socket.remoteAddress || "unknown";
    clients.set(ws2, { id: clientId, subscriptions: [] });
    console.log(`WebSocket client connected: ${clientId} from ${ip}`);
    ws2.send(JSON.stringify({
      type: "connection",
      status: "connected",
      clientId,
      timestamp: Date.now()
    }));
    ws2.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "subscribe") {
          const clientInfo = clients.get(ws2);
          if (clientInfo && data.channel) {
            clientInfo.subscriptions.push(data.channel);
            clients.set(ws2, clientInfo);
            ws2.send(JSON.stringify({
              type: "subscription",
              status: "subscribed",
              channel: data.channel
            }));
            if (data.channel === "pool_updates") {
              sendPoolData(ws2);
            }
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws2.send(JSON.stringify({
          type: "error",
          message: "Invalid message format"
        }));
      }
    });
    ws2.on("close", () => {
      const clientInfo = clients.get(ws2);
      if (clientInfo) {
        console.log(`WebSocket client disconnected: ${clientInfo.id}`);
        clients.delete(ws2);
      }
    });
  });
  let lastPoolData = null;
  async function sendPoolData(client) {
    try {
      let solBalance = 0;
      let yotBalance = 0;
      let yosBalance = 0;
      const conn = getConnection();
      try {
        const poolSolAccount = new PublicKey(POOL_SOL_ACCOUNT);
        solBalance = await conn.getBalance(poolSolAccount);
        console.log(`Fetched SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);
      } catch (solError) {
        console.error("Error fetching SOL balance, will try one more time:", solError);
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const freshConn = getConnection();
          const poolSolAccount = new PublicKey(POOL_SOL_ACCOUNT);
          solBalance = await freshConn.getBalance(poolSolAccount);
          console.log(`Retry successful, fetched SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);
        } catch (retryError) {
          console.error("Retry failed to fetch SOL balance:", retryError);
        }
      }
      try {
        const poolAuthority = new PublicKey(POOL_AUTHORITY);
        const yotTokenMint = new PublicKey(YOT_TOKEN_ADDRESS);
        const yotTokenAccount = await getAssociatedTokenAddress(
          yotTokenMint,
          poolAuthority
        );
        const tokenAccountInfo = await getAccount(conn, yotTokenAccount);
        const mintInfo = await getMint(conn, yotTokenMint);
        yotBalance = Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
        console.log(`Fetched YOT balance: ${yotBalance} YOT`);
      } catch (yotError) {
        console.error("Error getting YOT balance:", yotError);
      }
      try {
        const poolAuthority = new PublicKey(POOL_AUTHORITY);
        const yosTokenMint = new PublicKey(YOS_TOKEN_ADDRESS);
        const yosTokenAccount = await getAssociatedTokenAddress(
          yosTokenMint,
          poolAuthority
        );
        const tokenAccountInfo = await getAccount(conn, yosTokenAccount);
        const mintInfo = await getMint(conn, yosTokenMint);
        yosBalance = Number(tokenAccountInfo.amount) / Math.pow(10, mintInfo.decimals);
        console.log(`Fetched YOS balance: ${yosBalance} YOS`);
      } catch (yosError) {
        console.log("YOS token account may not exist yet or error occurred:", yosError);
      }
      const solPrice = 148.35;
      const solValue = solBalance / LAMPORTS_PER_SOL * solPrice;
      const k = solBalance / LAMPORTS_PER_SOL * yotBalance;
      const totalValue = solValue * 2;
      const poolData = {
        sol: solBalance / LAMPORTS_PER_SOL,
        yot: yotBalance,
        yos: yosBalance,
        totalValue,
        constantProduct: k,
        timestamp: Date.now()
      };
      if (JSON.stringify(poolData) !== JSON.stringify(lastPoolData)) {
        lastPoolData = poolData;
        const message = JSON.stringify({
          type: "pool_update",
          data: poolData
        });
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(message);
        } else {
          Array.from(clients.entries()).forEach(([wsClient, info]) => {
            if (wsClient.readyState === WebSocket.OPEN && info.subscriptions.includes("pool_updates")) {
              wsClient.send(message);
            }
          });
        }
      }
    } catch (error) {
      console.error("Error fetching pool data for WebSocket:", error);
    }
  }
  setInterval(sendPoolData, 5e3);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
