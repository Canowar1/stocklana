/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stocklana.json`.
 */
export type Stocklana = {
  "address": "EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ",
  "metadata": {
    "name": "stocklana",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Covered-call market for tokenized equity on Solana"
  },
  "instructions": [
    {
      "name": "acceptBid",
      "docs": [
        "The writer takes one bid. Premium settles immediately, minus the fee."
      ],
      "discriminator": [
        196,
        191,
        1,
        229,
        144,
        172,
        122,
        227
      ],
      "accounts": [
        {
          "name": "writer",
          "writable": true,
          "signer": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "writable": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bid.bidder",
                "account": "bid"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bid.bidder",
                "account": "bid"
              }
            ]
          }
        },
        {
          "name": "premiumMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "writerPremiumAccount",
          "writable": true
        },
        {
          "name": "feeDestination",
          "writable": true
        },
        {
          "name": "premiumTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "addMarket",
      "docs": [
        "Registers an underlying and its oracle. The feed account is verified",
        "here so that `settle` can trust the market record later."
      ],
      "discriminator": [
        41,
        137,
        185,
        126,
        69,
        139,
        254,
        55
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              },
              {
                "kind": "arg",
                "path": "feedId"
              }
            ]
          }
        },
        {
          "name": "underlyingMint"
        },
        {
          "name": "premiumMint"
        },
        {
          "name": "feedAccount"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feedId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "maxStalenessSecs",
          "type": "u32"
        },
        {
          "name": "maxConfBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "adminCloseAccount",
      "docs": [
        "Escape hatch for an account this program owns that no longer matches the",
        "struct it was written with, which is what happens when a layout changes",
        "before launch. Typed instructions cannot touch such an account at all,",
        "because Anchor refuses to deserialize it.",
        "",
        "Authorised by the program's upgrade authority rather than by the config,",
        "so it still works when the config itself is the stale account. This",
        "grants no power that authority did not already have: anyone who can",
        "replace the program can already do anything to its accounts.",
        "",
        "It moves no tokens. Collateral lives in SPL token accounts owned by",
        "vault PDAs, which this cannot touch."
      ],
      "discriminator": [
        131,
        60,
        75,
        215,
        109,
        34,
        157,
        26
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "target",
          "docs": [
            "wiped. Guarded by the upgrade-authority constraint below."
          ],
          "writable": true
        },
        {
          "name": "program",
          "address": "EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ"
        },
        {
          "name": "programData"
        }
      ],
      "args": []
    },
    {
      "name": "cancelBid",
      "docs": [
        "Withdraws an escrowed bid that has not been accepted."
      ],
      "discriminator": [
        40,
        243,
        190,
        217,
        208,
        253,
        86,
        206
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "market",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "premiumMint"
        },
        {
          "name": "bidderTokenAccount",
          "writable": true
        },
        {
          "name": "premiumTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "closeConfig",
      "docs": [
        "Closes the config and returns its rent. Only the authority, and only",
        "useful when tearing down a deployment."
      ],
      "discriminator": [
        145,
        9,
        72,
        157,
        95,
        125,
        61,
        85
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeMarket",
      "docs": [
        "Closes a market and returns its rent. Deliberately strict: the market",
        "must be disabled first, so no new offers can arrive, and every offer",
        "written against it must already have settled or been reclaimed. Closing",
        "a market with live offers would leave their collateral unreachable."
      ],
      "discriminator": [
        88,
        154,
        248,
        186,
        48,
        14,
        123,
        244
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initConfig",
      "docs": [
        "Only the program's upgrade authority may call this. Without that check",
        "the first caller after a fresh deploy becomes the protocol authority,",
        "which is front-runnable by anyone watching for the deploy transaction."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "feeDestination"
        },
        {
          "name": "program",
          "address": "EZRD9fkVxxQy97Ls35vDsnhQ1Tn8b6HagWeXV8GyqgNQ"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "minDuration",
          "type": "i64"
        }
      ]
    },
    {
      "name": "placeBid",
      "docs": [
        "Escrows a USDC premium bid against an open offer."
      ],
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "premiumMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidderTokenAccount",
          "writable": true
        },
        {
          "name": "premiumTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reclaim",
      "docs": [
        "Returns collateral to the writer when the offer expired without a buyer."
      ],
      "discriminator": [
        44,
        177,
        236,
        249,
        145,
        109,
        163,
        186
      ],
      "accounts": [
        {
          "name": "writer",
          "writable": true,
          "signer": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "underlyingMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "writerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "refundBid",
      "docs": [
        "Refunds a losing bid once the offer has been filled, or any active bid",
        "after expiry."
      ],
      "discriminator": [
        171,
        145,
        79,
        190,
        16,
        50,
        10,
        24
      ],
      "accounts": [
        {
          "name": "bidder",
          "writable": true,
          "signer": true,
          "relations": [
            "bid"
          ]
        },
        {
          "name": "market",
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "relations": [
            "bid"
          ]
        },
        {
          "name": "bid",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "bidVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  105,
                  100,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "bidder"
              }
            ]
          }
        },
        {
          "name": "premiumMint"
        },
        {
          "name": "bidderTokenAccount",
          "writable": true
        },
        {
          "name": "premiumTokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "setMarketEnabled",
      "discriminator": [
        206,
        60,
        159,
        159,
        62,
        242,
        4,
        82
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "settle",
      "docs": [
        "Settles an accepted call after expiry. Permissionless on purpose: if",
        "only the buyer could call this, an out-of-the-money buyer would simply",
        "never call it and the writer's collateral would stay locked forever."
      ],
      "discriminator": [
        175,
        42,
        185,
        87,
        144,
        131,
        102,
        212
      ],
      "accounts": [
        {
          "name": "cranker",
          "docs": [
            "Anyone may push settlement through. They pay for the buyer's token",
            "account if it does not exist yet."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "offer",
          "writable": true
        },
        {
          "name": "underlyingMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "feedAccount",
          "relations": [
            "market"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "buyer"
        },
        {
          "name": "buyerTokenAccount",
          "docs": [
            "`init_if_needed` is safe here: the address is constrained to the",
            "canonical associated token account for this mint and authority, so",
            "there is no account an attacker could substitute, and a token account",
            "cannot be re-initialised to reset state."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "writer"
        },
        {
          "name": "writerTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "writer"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "underlyingMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "writeCall",
      "docs": [
        "Locks collateral and writes one call against it."
      ],
      "discriminator": [
        62,
        237,
        168,
        152,
        173,
        232,
        243,
        212
      ],
      "accounts": [
        {
          "name": "writer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "underlyingMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "writer"
              },
              {
                "kind": "arg",
                "path": "offerId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              }
            ]
          }
        },
        {
          "name": "writerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "offerId",
          "type": "u64"
        },
        {
          "name": "collateralAmount",
          "type": "u64"
        },
        {
          "name": "strikeUsd",
          "type": "u64"
        },
        {
          "name": "expiryTs",
          "type": "i64"
        },
        {
          "name": "minPremium",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bid",
      "discriminator": [
        143,
        246,
        48,
        245,
        42,
        145,
        180,
        88
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "offer",
      "discriminator": [
        215,
        88,
        60,
        71,
        170,
        162,
        73,
        229
      ]
    }
  ],
  "events": [
    {
      "name": "bidAccepted",
      "discriminator": [
        19,
        140,
        36,
        175,
        195,
        5,
        55,
        193
      ]
    },
    {
      "name": "bidPlaced",
      "discriminator": [
        135,
        53,
        176,
        83,
        193,
        69,
        108,
        61
      ]
    },
    {
      "name": "callWritten",
      "discriminator": [
        83,
        63,
        43,
        50,
        27,
        190,
        124,
        120
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "staleOracle",
      "msg": "Oracle price is older than the market's max staleness"
    },
    {
      "code": 6001,
      "name": "wrongFeed",
      "msg": "Oracle account feed id does not match the market"
    },
    {
      "code": 6002,
      "name": "badExponent",
      "msg": "Oracle exponent is not -8"
    },
    {
      "code": 6003,
      "name": "badOracleOwner",
      "msg": "Oracle account is not owned by the Pyth receiver program"
    },
    {
      "code": 6004,
      "name": "badOraclePrice",
      "msg": "Oracle price is not positive"
    },
    {
      "code": 6005,
      "name": "oracleConfidenceTooWide",
      "msg": "Oracle confidence interval is wider than the market allows"
    },
    {
      "code": 6006,
      "name": "notExpired",
      "msg": "Offer has not reached its expiry yet"
    },
    {
      "code": 6007,
      "name": "badOfferState",
      "msg": "Offer is not in the required state for this instruction"
    },
    {
      "code": 6008,
      "name": "badBidState",
      "msg": "Bid is not in the required state for this instruction"
    },
    {
      "code": 6009,
      "name": "belowMinPremium",
      "msg": "Bid amount is below the offer's minimum premium"
    },
    {
      "code": 6010,
      "name": "expiryTooSoon",
      "msg": "Expiry is sooner than the configured minimum duration"
    },
    {
      "code": 6011,
      "name": "expiryInPast",
      "msg": "Expiry is already in the past"
    },
    {
      "code": 6012,
      "name": "mintPaused",
      "msg": "The underlying mint is paused, transfers cannot settle"
    },
    {
      "code": 6013,
      "name": "marketDisabled",
      "msg": "Market is disabled by the authority"
    },
    {
      "code": 6014,
      "name": "marketHasOpenOffers",
      "msg": "Market still has outstanding offers and cannot be closed"
    },
    {
      "code": 6015,
      "name": "marketStillEnabled",
      "msg": "Market must be disabled before it can be closed"
    },
    {
      "code": 6016,
      "name": "unauthorized",
      "msg": "Signer is not authorised for this action"
    },
    {
      "code": 6017,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6018,
      "name": "zeroCollateral",
      "msg": "Collateral amount must be greater than zero"
    },
    {
      "code": 6019,
      "name": "zeroStrike",
      "msg": "Strike must be greater than zero"
    },
    {
      "code": 6020,
      "name": "feeTooHigh",
      "msg": "Fee in basis points exceeds 100%"
    },
    {
      "code": 6021,
      "name": "badMintDecimals",
      "msg": "Underlying mint has more decimals than the program supports"
    }
  ],
  "types": [
    {
      "name": "bid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "bidState"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "bidAccepted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "premium",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bidPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "bidder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bidState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "won"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "callWritten",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "writer",
            "type": "pubkey"
          },
          {
            "name": "collateralAmount",
            "type": "u64"
          },
          {
            "name": "strikeUsd",
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "multiplier",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "docs": [
              "Basis points taken from an accepted premium."
            ],
            "type": "u16"
          },
          {
            "name": "feeDestination",
            "docs": [
              "USDC token account that receives the fee."
            ],
            "type": "pubkey"
          },
          {
            "name": "minDuration",
            "docs": [
              "Minimum seconds between writing a call and its expiry."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "underlyingMint",
            "docs": [
              "Token-2022 mint of the underlying, 8 decimals."
            ],
            "type": "pubkey"
          },
          {
            "name": "premiumMint",
            "docs": [
              "Mint the premium is paid in, USDC, 6 decimals."
            ],
            "type": "pubkey"
          },
          {
            "name": "feedAccount",
            "docs": [
              "Pyth `PriceUpdateV2` account, owned by the receiver program."
            ],
            "type": "pubkey"
          },
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedOwner",
            "docs": [
              "The program that owned the feed account when this market was registered.",
              "Recorded rather than assumed, and re-checked on every settlement, so a",
              "feed cannot change hands underneath a live position. On a real Pyth",
              "market this is the receiver program; anything else is a mirror and the",
              "interface says so."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxStalenessSecs",
            "type": "u32"
          },
          {
            "name": "maxConfBps",
            "docs": [
              "Ceiling on the oracle's confidence interval as a fraction of the price,",
              "in basis points. A settlement price whose band is wider than this is",
              "refused. Pyth publishes confidence for a reason and a wide band means",
              "the publishers disagree."
            ],
            "type": "u16"
          },
          {
            "name": "openOffers",
            "docs": [
              "Offers written against this market that have not yet settled or been",
              "reclaimed. A market cannot be closed while any are outstanding, because",
              "closing it would make their collateral unrecoverable."
            ],
            "type": "u32"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "writer",
            "type": "pubkey"
          },
          {
            "name": "offerId",
            "type": "u64"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "Raw base units of the underlying locked in the vault."
            ],
            "type": "u64"
          },
          {
            "name": "strikeUsd",
            "docs": [
              "USD per UI unit, scaled by 1e8."
            ],
            "type": "u64"
          },
          {
            "name": "expiryTs",
            "type": "i64"
          },
          {
            "name": "minPremium",
            "docs": [
              "USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "multiplierAtWrite",
            "docs": [
              "f64 bits of the mint's effective scaledUiAmount multiplier at write time.",
              "Used to adjust the strike if a corporate action moves the multiplier."
            ],
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "offerState"
              }
            }
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "premiumPaid",
            "type": "u64"
          },
          {
            "name": "settledPrice",
            "docs": [
              "Oracle price used at settlement, scaled by 1e8. Zero until settled."
            ],
            "type": "u64"
          },
          {
            "name": "settledStrike",
            "docs": [
              "Strike after the multiplier adjustment, written at settlement."
            ],
            "type": "u64"
          },
          {
            "name": "payoutAmount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "offerState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "filled"
          },
          {
            "name": "settled"
          },
          {
            "name": "reclaimed"
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offer",
            "type": "pubkey"
          },
          {
            "name": "settlePrice",
            "type": "u64"
          },
          {
            "name": "adjustedStrike",
            "type": "u64"
          },
          {
            "name": "publishTime",
            "type": "i64"
          },
          {
            "name": "confidence",
            "type": "u64"
          },
          {
            "name": "payoutToBuyer",
            "type": "u64"
          },
          {
            "name": "returnedToWriter",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
