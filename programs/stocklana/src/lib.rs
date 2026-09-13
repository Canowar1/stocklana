use anchor_lang::prelude::*;

declare_id!("EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ");

#[program]
pub mod stocklana {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
