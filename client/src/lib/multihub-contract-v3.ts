/**
 * MultihubSwap V3 Contract
 * 
 * This is an upgraded version of the multihub swap contract with improved
 * token account validation and error handling.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token';

/**
 * Helper function to write a BigInt as a little-endian 64-bit value
 * This is needed because the DataView API doesn't have built-in BigInt support in some environments
 */
function writeBigUInt64LE(dataView: DataView, byteOffset: number, value: bigint) {
  const lsb = Number(value & BigInt(0xFFFFFFFF));
  const msb = Number(value >> BigInt(32));
  dataView.setUint32(byteOffset, lsb, true);
  dataView.setUint32(byteOffset + 4, msb, true);
}

// Program ID for the multihub swap V3 contract
export const MULTIHUB_SWAP_PROGRAM_ID = 'Cohae9agySEgC9gyJL1QHCJWw4q58R7Wshr3rpPJHU7L';

// Token addresses (same as original contract)
export const YOT_TOKEN_MINT = '2EmUMo6kgmospSja3FUpYT3Yrps2YjHJtU9oZohr5GPF';
export const YOS_TOKEN_MINT = 'GcsjAVWYaTce9cpFLm2eGhRjZauvtSP3z3iMrZsrMW8n';

// Constants for the program
export const LP_CONTRIBUTION_RATE = 2000; // 20%
export const ADMIN_FEE_RATE = 10; // 0.1%
export const YOS_CASHBACK_RATE = 300; // 3%  
export const SWAP_FEE_RATE = 30; // 0.3%
export const REFERRAL_RATE = 50; // 0.5%

/**
 * Find the program's authority PDA
 */
export function findProgramAuthorityAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('authority')],
    new PublicKey(MULTIHUB_SWAP_PROGRAM_ID)
  );
}

/**
 * Find the program's state PDA
 */
export function findProgramStateAddress(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('state')],
    new PublicKey(MULTIHUB_SWAP_PROGRAM_ID)
  );
}

/**
 * Initialize the multihub swap program
 */
export async function initializeProgram(
  connection: Connection,
  wallet: any
): Promise<string> {
  try {
    // Create a new transaction
    const transaction = new Transaction();
    
    // Set fee payer immediately
    transaction.feePayer = wallet.publicKey;
    
    // Add a recent blockhash immediately
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Get program state address
    const [programStateAddress, _] = findProgramStateAddress();
    const [programAuthorityAddress, __] = findProgramAuthorityAddress();
    
    // Create a conforming Borsh serialization for the Rust-side SwapInstruction enum
    // Initialize has fields for admin, mints, and rates
    const adminPubkey = wallet.publicKey.toBuffer();
    const yotMintPubkey = new PublicKey(YOT_TOKEN_MINT).toBuffer();
    const yosMintPubkey = new PublicKey(YOS_TOKEN_MINT).toBuffer();
    
    // Create a buffer for each of the u64 rates
    const lpContributionBuffer = Buffer.alloc(8);
    const adminFeeBuffer = Buffer.alloc(8);
    const yosCashbackBuffer = Buffer.alloc(8);
    const swapFeeBuffer = Buffer.alloc(8);
    const referralBuffer = Buffer.alloc(8);
    
    // Write the u64 values in little-endian format
    lpContributionBuffer.writeBigUInt64LE(BigInt(LP_CONTRIBUTION_RATE), 0);
    adminFeeBuffer.writeBigUInt64LE(BigInt(ADMIN_FEE_RATE), 0);
    yosCashbackBuffer.writeBigUInt64LE(BigInt(YOS_CASHBACK_RATE), 0);
    swapFeeBuffer.writeBigUInt64LE(BigInt(SWAP_FEE_RATE), 0);
    referralBuffer.writeBigUInt64LE(BigInt(REFERRAL_RATE), 0);
    
    // Combine all buffers in the exact order expected by the SwapInstruction::Initialize variant
    const instructionData = Buffer.concat([
      Buffer.from([0]), // Variant index for Initialize (0-indexed)
      adminPubkey,      // admin: Pubkey (32 bytes)
      yotMintPubkey,    // yot_mint: Pubkey (32 bytes)
      yosMintPubkey,    // yos_mint: Pubkey (32 bytes)
      lpContributionBuffer, // lp_contribution_rate: u64 (8 bytes)
      adminFeeBuffer,       // admin_fee_rate: u64 (8 bytes)
      yosCashbackBuffer,    // yos_cashback_rate: u64 (8 bytes)
      swapFeeBuffer,        // swap_fee_rate: u64 (8 bytes)
      referralBuffer        // referral_rate: u64 (8 bytes)
    ]);
    
    // Output debugging info
    console.log('Initialize program instruction data length:', instructionData.length);
    
    const initializeData = instructionData;
    
    // Add the initialize instruction to the transaction
    transaction.add({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: programStateAddress, isSigner: false, isWritable: true },
        { pubkey: programAuthorityAddress, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false }
      ],
      programId: new PublicKey(MULTIHUB_SWAP_PROGRAM_ID),
      data: Buffer.from(initializeData)
    });
    
    // Simulate the transaction to check for errors
    console.log('Simulating initialize program transaction...');
    const simulation = await connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      console.error('Initialization simulation failed:', simulation.value.err);
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // Send the transaction
    const signature = await wallet.sendTransaction(transaction, connection);
    console.log('Program initialization transaction sent:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error in initialize program function:', error);
    throw error;
  }
}

/**
 * Ensure a token account exists, or create it if it doesn't
 */
async function ensureTokenAccount(
  connection: Connection,
  wallet: any,
  mint: PublicKey,
  transaction: Transaction
): Promise<PublicKey> {
  // Get the associated token address for the wallet
  const tokenAccount = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey
  );
  
  // Check if the account exists
  const accountInfo = await connection.getAccountInfo(tokenAccount);
  
  // If account doesn't exist, create it
  if (!accountInfo) {
    console.log('Creating token account for mint:', mint.toString());
    const createAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      tokenAccount,
      wallet.publicKey,
      mint
    );
    transaction.add(createAtaIx);
  }
  
  return tokenAccount;
}

/**
 * Perform a token swap using the multihub swap V3 program
 */
export async function performSwap(
  connection: Connection,
  wallet: any,
  tokenFromMint: PublicKey,
  tokenToMint: PublicKey,
  amountIn: number,
  minAmountOut: number
): Promise<string> {
  try {
    // Create a new transaction
    const transaction = new Transaction();
    
    // Set fee payer immediately
    transaction.feePayer = wallet.publicKey;
    
    // Add a recent blockhash immediately
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Ensure token accounts exist
    const tokenFromAccount = await ensureTokenAccount(
      connection, 
      wallet, 
      tokenFromMint, 
      transaction
    );
    
    const tokenToAccount = await ensureTokenAccount(
      connection, 
      wallet, 
      tokenToMint, 
      transaction
    );
    
    // Ensure YOS token account exists
    const yosTokenAccount = await ensureTokenAccount(
      connection,
      wallet,
      new PublicKey(YOS_TOKEN_MINT),
      transaction
    );
    
    // Get program addresses
    const [programStateAddress, _] = findProgramStateAddress();
    const [programAuthorityAddress, __] = findProgramAuthorityAddress();
    
    // Create a conforming Borsh serialization for the Rust-side SwapInstruction enum
    // The Swap variant has amount_in and min_amount_out fields
    
    // Create buffers for the u64 values
    const amountInBuffer = Buffer.alloc(8);
    const minAmountOutBuffer = Buffer.alloc(8);
    
    // Write the values in little-endian format
    amountInBuffer.writeBigUInt64LE(BigInt(amountIn), 0);
    minAmountOutBuffer.writeBigUInt64LE(BigInt(minAmountOut), 0);
    
    // Combine the buffers in the exact order expected by the Swap variant
    // Try different variant index to match the contract's expectations
    // Original used index 1, now trying index 2 (which could match Instruction::Swap in a unified enum)
    const instructionData = Buffer.concat([
      Buffer.from([2]), // Variant index for Swap (using index 2 instead of 1)
      amountInBuffer,    // amount_in: u64 (8 bytes)
      minAmountOutBuffer // min_amount_out: u64 (8 bytes)
    ]);
    
    // Output debugging info
    console.log('Swap instruction data length:', instructionData.length);
    console.log('Swap instruction data:', Buffer.isBuffer(instructionData) ? 
      Array.from(new Uint8Array(instructionData)) : instructionData);
    
    const swapData = instructionData;
    
    // Find all Token Program PDAs for token account verification
    const tokenFromMintATA = await getAssociatedTokenAddress(
      tokenFromMint,
      programAuthorityAddress,
      true  // allowOwnerOffCurve: true for PDAs
    );
    
    const tokenToMintATA = await getAssociatedTokenAddress(
      tokenToMint, 
      programAuthorityAddress,
      true // allowOwnerOffCurve: true for PDAs
    );
    
    const yosTokenProgramATA = await getAssociatedTokenAddress(
      new PublicKey(YOS_TOKEN_MINT),
      programAuthorityAddress,
      true // allowOwnerOffCurve: true for PDAs
    );
    
    // Check if program token accounts exist and create them if needed
    try {
      // Check the program's token accounts
      const tokenFromProgramAccount = await connection.getAccountInfo(tokenFromMintATA);
      if (!tokenFromProgramAccount) {
        console.log('Creating program token account for tokenFromMint:', tokenFromMint.toString());
        const ix = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          tokenFromMintATA,
          programAuthorityAddress,
          tokenFromMint
        );
        transaction.add(ix);
      }
      
      const tokenToProgramAccount = await connection.getAccountInfo(tokenToMintATA);
      if (!tokenToProgramAccount) {
        console.log('Creating program token account for tokenToMint:', tokenToMint.toString());
        const ix = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          tokenToMintATA,
          programAuthorityAddress,
          tokenToMint
        );
        transaction.add(ix);
      }
      
      const yosProgramAccount = await connection.getAccountInfo(yosTokenProgramATA);
      if (!yosProgramAccount) {
        console.log('Creating program token account for YOS mint');
        const ix = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          yosTokenProgramATA,
          programAuthorityAddress,
          new PublicKey(YOS_TOKEN_MINT)
        );
        transaction.add(ix);
      }
    } catch (err) {
      console.warn('Error checking program token accounts:', err);
      // Continue anyway as this may not be fatal
    }
    
    console.log('Token accounts for program operation:', {
      tokenFromAccount: tokenFromAccount.toBase58(),
      tokenToAccount: tokenToAccount.toBase58(),
      tokenFromMintATA: tokenFromMintATA.toBase58(),
      tokenToMintATA: tokenToMintATA.toBase58(),
      yosTokenAccount: yosTokenAccount.toBase58(),
      yosTokenProgramATA: yosTokenProgramATA.toBase58(),
      programAuthorityAddress: programAuthorityAddress.toBase58()
    });
    
    // Add token mint accounts to the transaction
    // Including the mint accounts is often required for proper validation
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
    const SYSVAR_RENT_PUBKEY = new PublicKey('SysvarRent111111111111111111111111111111111');
    
    // Perform additional validation and ensure APR accounts exist
    console.log(`Using tokenFromMint: ${tokenFromMint.toString()}`);
    console.log(`Using tokenToMint: ${tokenToMint.toString()}`);
    console.log(`Using YOS mint: ${YOS_TOKEN_MINT}`);
    
    // Add the swap instruction to the transaction with more complete account list
    transaction.add({
      keys: [
        // User accounts
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // User wallet
        { pubkey: programStateAddress, isSigner: false, isWritable: true }, // Program state for updating
        { pubkey: programAuthorityAddress, isSigner: false, isWritable: false }, // Program authority for token transfers
        
        // User token accounts
        { pubkey: tokenFromAccount, isSigner: false, isWritable: true }, // User's source token account
        { pubkey: tokenToAccount, isSigner: false, isWritable: true }, // User's destination token account
        { pubkey: yosTokenAccount, isSigner: false, isWritable: true }, // User's YOS token account for cashback
        
        // Program token accounts
        { pubkey: tokenFromMintATA, isSigner: false, isWritable: true }, // Program's token account for source token
        { pubkey: tokenToMintATA, isSigner: false, isWritable: true }, // Program's token account for destination token
        { pubkey: yosTokenProgramATA, isSigner: false, isWritable: true }, // Program's YOS token account
        
        // Token mints
        { pubkey: tokenFromMint, isSigner: false, isWritable: false }, // From token mint
        { pubkey: tokenToMint, isSigner: false, isWritable: false }, // To token mint
        { pubkey: new PublicKey(YOS_TOKEN_MINT), isSigner: false, isWritable: false }, // YOS token mint
        
        // System programs
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // SPL Token program
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false }, // System program
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }, // Rent sysvar
      ],
      programId: new PublicKey(MULTIHUB_SWAP_PROGRAM_ID),
      data: Buffer.from(swapData)
    });
    
    // Simulate the transaction to check for errors with detailed output
    console.log('Simulating swap transaction...');
    const simulation = await connection.simulateTransaction(transaction, undefined, true);
    
    // Log detailed simulation results
    console.log('Detailed swap simulation logs:', simulation.value.logs);
    
    if (simulation.value.err) {
      console.error('Swap simulation failed:', simulation.value.err);
      console.error('Simulation error details:', JSON.stringify(simulation.value.err));
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // Send the transaction
    console.log('Sending swap transaction...');
    const signature = await wallet.sendTransaction(transaction, connection);
    console.log('Swap transaction sent:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error in swap function:', error);
    throw error;
  }
}

/**
 * Close the program (admin only)
 */
export async function closeProgram(
  connection: Connection,
  wallet: any
): Promise<string> {
  try {
    // Create a new transaction
    const transaction = new Transaction();
    
    // Set fee payer immediately
    transaction.feePayer = wallet.publicKey;
    
    // Add a recent blockhash immediately
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    // Get program state and authority addresses
    const [programStateAddress, _] = findProgramStateAddress();
    const [programAuthorityAddress, __] = findProgramAuthorityAddress();
    
    // Create a SIMPLE binary instruction - just a single byte for the instruction type
    // Contract could be using an enum index of 3 or 4 for close
    // Let's try index 3 first (follows same scheme as our initialize fix)
    const instructionData = Buffer.from([3]);
    
    // Output debugging info
    console.log('Close program instruction data (simple format):', 
      Array.from(new Uint8Array(instructionData)));
    
    const closeProgramData = instructionData;
    
    // Add the close program instruction to the transaction
    // IMPORTANT: Ensure we include ALL the required accounts:
    // 1. Admin account (signer)
    // 2. Program state account (PDA)
    // 3. Program authority account (PDA used for token operations)
    transaction.add({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // Admin account that receives the rent
        { pubkey: programStateAddress, isSigner: false, isWritable: true }, // Program state account to be closed
        { pubkey: programAuthorityAddress, isSigner: false, isWritable: false }, // Program authority - may be needed
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // System Program - needed for closing accounts
      ],
      programId: new PublicKey(MULTIHUB_SWAP_PROGRAM_ID),
      data: Buffer.from(closeProgramData)
    });
    
    // Simulate the transaction to check for errors
    console.log('Simulating close program transaction...');
    const simulation = await connection.simulateTransaction(transaction, undefined, true);
    
    // Log detailed information
    console.log('Detailed simulation logs:', simulation.value.logs);
    
    if (simulation.value.err) {
      console.error('Transaction simulation failed:', simulation.value.err);
      console.error('Simulation error details:', JSON.stringify(simulation.value.err));
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // Send the transaction
    const signature = await wallet.sendTransaction(transaction, connection);
    console.log('Program close transaction sent:', signature);
    
    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');
    
    return signature;
  } catch (error) {
    console.error('Error in close program function:', error);
    throw error;
  }
}

export default {
  MULTIHUB_SWAP_PROGRAM_ID,
  YOT_TOKEN_MINT,
  YOS_TOKEN_MINT,
  findProgramAuthorityAddress,
  findProgramStateAddress,
  initializeProgram,
  performSwap,
  closeProgram
};