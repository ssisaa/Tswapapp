/**
 * Fixed MultiHub Swap Client Implementation
 * Created to work with the fixed Solana contract (multihub_swap_fixed.rs)
 */
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  Commitment,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
} from '@solana/spl-token';
import { ENDPOINT, MULTI_HUB_SWAP_PROGRAM_ID } from './constants';

// Token mint addresses
const YOT_TOKEN_MINT = new PublicKey('2EmUMo6kgmospSja3FUpYT3Yrps2YjHJtU9oZohr5GPF');
const YOS_TOKEN_MINT = new PublicKey('GcsjAVWYaTce9cpFLm2eGhRjZauvtSP3z3iMrZsrMW8n');
const MULTIHUB_SWAP_PROGRAM_ID = new PublicKey(MULTI_HUB_SWAP_PROGRAM_ID);

/**
 * Initialize the MultiHub Swap Program with required parameters
 * This should be called only once to set up the program state
 */
export async function initializeMultiHubSwap(
  adminWallet: any,
  yotMint = YOT_TOKEN_MINT,
  yosMint = YOS_TOKEN_MINT
): Promise<string> {
  console.log("Starting program initialization...");
  const connection = new Connection(ENDPOINT, 'confirmed');

  if (!adminWallet.publicKey) {
    throw new Error("Admin wallet not connected");
  }

  console.log("Admin:", adminWallet.publicKey.toString());
  console.log("YOT Mint:", yotMint.toString());
  console.log("YOS Mint:", yosMint.toString());

  // Find program state PDA
  const [programStateAddress, stateBump] = await PublicKey.findProgramAddress(
    [Buffer.from("program_state")],
    MULTIHUB_SWAP_PROGRAM_ID
  );
  console.log("Program state address:", programStateAddress.toString());

  // Find authority PDA
  const [authorityAddress, authorityBump] = await PublicKey.findProgramAddress(
    [Buffer.from("authority")],
    MULTIHUB_SWAP_PROGRAM_ID
  );
  console.log("Authority address:", authorityAddress.toString());

  // Find SOL-YOT pool address or create a placeholder for now
  const solYotPool = new PublicKey("7xXdF9GUs3T8kCsfLkaQ72fJtu137vwzQAyRd9zE7dHS");
  console.log("SOL-YOT pool address:", solYotPool.toString());

  // Create instruction data for Initialize instruction
  // Format: [0, authority_bump]
  const INITIALIZE_INSTRUCTION = 0;
  const data = Buffer.alloc(2);
  data.writeUInt8(INITIALIZE_INSTRUCTION, 0);
  data.writeUInt8(authorityBump, 1);

  console.log("Initialize instruction data:", data.toString('hex'));

  // Create the transaction
  const transaction = new Transaction();
  
  // Add initialization instruction
  const initInstruction = new TransactionInstruction({
    keys: [
      { pubkey: adminWallet.publicKey, isSigner: true, isWritable: true },          // 0. Admin account (signer)
      { pubkey: programStateAddress, isSigner: false, isWritable: true },           // 1. Program state account (PDA)
      { pubkey: yotMint, isSigner: false, isWritable: false },                      // 2. YOT token mint
      { pubkey: yosMint, isSigner: false, isWritable: false },                      // 3. YOS token mint
      { pubkey: solYotPool, isSigner: false, isWritable: false },                   // 4. SOL-YOT liquidity pool
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // 5. System program
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },            // 6. Rent sysvar
    ],
    programId: MULTIHUB_SWAP_PROGRAM_ID,
    data: data
  });

  transaction.add(initInstruction);

  // Get a recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = adminWallet.publicKey;

  console.log("Sending initialization transaction...");

  try {
    // Simulate transaction first
    const simulation = await connection.simulateTransaction(transaction);
    console.log("Simulation result:", simulation.value);

    if (simulation.value.err) {
      console.error("Simulation failed:", simulation.value.err);
      const logs = simulation.value.logs;
      if (logs) {
        console.log("Simulation logs:", logs);
      }
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }

    // Sign and send
    const signature = await adminWallet.sendTransaction(transaction, connection);
    console.log("Initialization transaction sent:", signature);

    // Confirm transaction
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    });

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log("MultiHub Swap Program initialized successfully!");
    return signature;
  } catch (error) {
    console.error("Initialization failed:", error);
    throw error;
  }
}

/**
 * Execute token swap using the fixed MultiHub Swap contract
 */
export async function executeMultiHubSwap(
  wallet: any,
  fromToken: PublicKey,
  toToken: PublicKey,
  amount: number,
  minAmountOut: number
): Promise<string> {
  console.log("Starting MultiHub swap execution...");
  const connection = new Connection(ENDPOINT, 'confirmed');

  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  // Convert tokens to PublicKey objects if they are strings
  const fromMint = typeof fromToken === 'string' ? new PublicKey(fromToken) : fromToken;
  const toMint = typeof toToken === 'string' ? new PublicKey(toToken) : toToken;

  console.log("From token mint:", fromMint.toString());
  console.log("To token mint:", toMint.toString());
  console.log("Amount:", amount);
  console.log("Minimum amount out:", minAmountOut);

  // Get associated token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(fromMint, wallet.publicKey);
  const toTokenAccount = await getAssociatedTokenAddress(toMint, wallet.publicKey);
  const yosTokenAccount = await getAssociatedTokenAddress(YOS_TOKEN_MINT, wallet.publicKey);

  console.log("From token account:", fromTokenAccount.toString());
  console.log("To token account:", toTokenAccount.toString());
  console.log("YOS token account:", yosTokenAccount.toString());

  // Find program state PDA
  const [programStateAddress] = await PublicKey.findProgramAddress(
    [Buffer.from("program_state")],
    MULTIHUB_SWAP_PROGRAM_ID
  );
  console.log("Program state address:", programStateAddress.toString());

  // Convert amounts to raw u64 values (assuming 9 decimals)
  const amountRaw = BigInt(Math.floor(amount * 1_000_000_000));
  const minAmountOutRaw = BigInt(Math.floor(minAmountOut * 1_000_000_000));

  console.log("Amount (raw):", amountRaw.toString());
  console.log("Min amount out (raw):", minAmountOutRaw.toString());

  // Create instruction data for SwapToken
  // Format: [1, amount_in (8 bytes), min_amount_out (8 bytes)]
  const SWAP_TOKEN_INSTRUCTION = 1;
  const data = Buffer.alloc(1 + 8 + 8);
  data.writeUInt8(SWAP_TOKEN_INSTRUCTION, 0);
  data.writeBigUInt64LE(amountRaw, 1);
  data.writeBigUInt64LE(minAmountOutRaw, 9);

  console.log("Swap instruction data:", data.toString('hex'));

  // Create the transaction
  const transaction = new Transaction();

  // Create token accounts if they don't exist
  try {
    await getAccount(connection, fromTokenAccount);
    console.log("From token account exists");
  } catch (error) {
    console.log("Creating from token account");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        fromTokenAccount,
        wallet.publicKey,
        fromMint
      )
    );
  }

  try {
    await getAccount(connection, toTokenAccount);
    console.log("To token account exists");
  } catch (error) {
    console.log("Creating to token account");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        toTokenAccount,
        wallet.publicKey,
        toMint
      )
    );
  }

  try {
    await getAccount(connection, yosTokenAccount);
    console.log("YOS token account exists");
  } catch (error) {
    console.log("Creating YOS token account");
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        yosTokenAccount,
        wallet.publicKey,
        YOS_TOKEN_MINT
      )
    );
  }

  // Add the swap instruction
  const swapInstruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },             // 0. User wallet (signer)
      { pubkey: fromTokenAccount, isSigner: false, isWritable: true },            // 1. User's input token account
      { pubkey: toTokenAccount, isSigner: false, isWritable: true },              // 2. User's output token account
      { pubkey: yosTokenAccount, isSigner: false, isWritable: true },             // 3. User's YOS token account
      { pubkey: programStateAddress, isSigner: false, isWritable: false },        // 4. Program state account
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },           // 5. Token program
      { pubkey: fromMint, isSigner: false, isWritable: false },                   // 6. Input token mint
      { pubkey: toMint, isSigner: false, isWritable: false },                     // 7. Output token mint
    ],
    programId: MULTIHUB_SWAP_PROGRAM_ID,
    data: data
  });

  transaction.add(swapInstruction);

  // Get a recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = wallet.publicKey;

  console.log("Sending swap transaction...");

  try {
    // Simulate transaction first
    console.log("Simulating transaction...");
    const simulation = await connection.simulateTransaction(transaction);
    
    if (simulation.value.err) {
      console.error("Simulation failed:", simulation.value.err);
      const logs = simulation.value.logs;
      if (logs) {
        console.log("Simulation logs:", logs);
      }
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    console.log("Simulation successful");

    // Sign and send transaction
    console.log("Sending transaction for signing...");
    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: true, // Skip as we've already simulated
    });
    console.log("Transaction sent:", signature);

    // Confirm transaction
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log("Swap executed successfully!");
    return signature;
  } catch (error) {
    console.error("Swap failed:", error);
    
    // Enhanced error handling
    if (error instanceof Error) {
      if (error.message.includes("Custom program error: 0x0")) {
        throw new Error("Invalid instruction format. Contract may have been updated.");
      } else if (error.message.includes("Custom program error: 0x1")) {
        throw new Error("Program not initialized. Run initialization first.");
      } else if (error.message.includes("Custom program error: 0x4")) {
        throw new Error("Slippage exceeded. Try increasing minimum amount out or reducing slippage tolerance.");
      } else if (error.message.includes("Custom program error: 0x6")) {
        throw new Error("Insufficient funds for transaction.");
      }
    }
    
    throw error;
  }
}