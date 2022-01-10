function Prng (seed) {
  this.seed = seed
  this.rand = function () {
    this.seed = 0x19660D * this.seed + 0x3C6EF35F
    this.seed %= 0x100000000
    return this.seed
  }
  this.randBit = function () {
    return this.rand() % 2
  }
  this.randByte = function () {
    return this.rand() % 256
  }
  this.randShort = function () {
    return this.rand() % 65536
  }
  this.selectFromArray = function (array) {
    const roll = this.rand()
    const randomIndex = Math.floor(array.length * (roll / 0x100000000))
    return array[randomIndex]
  }
}

function Pokemon (species) {
  this.species = species
  this.moves = [0, 0, 0, 0]
  this.heldItem = 0
  this.level = 0
  this.dvs = {
    hp: 0,
    attack: 0,
    defense: 0,
    spclAtk: 0,
    spclDef: 0,
    speed: 0
  }
  this.statExp = {
    hp: 0,
    attack: 0,
    defense: 0,
    spclAtk: 0,
    spclDef: 0,
    speed: 0
  }
  this.unknownValue = 0
  this.isTalkingPikachu = false

  this.changeDvs = function (dvBytes) {
    this.dvs.hp = (dvBytes & 0x1000) >> 9
    this.dvs.hp += (dvBytes & 0x100) >> 6
    this.dvs.hp += (dvBytes & 0x10) >> 3
    this.dvs.hp += dvBytes & 0x1
    this.dvs.attack = dvBytes >> 12
    this.dvs.defense = (dvBytes >> 8) & 0xF
    this.dvs.spclAtk = dvBytes & 0xF
    this.dvs.spclDef = dvBytes & 0xF
    this.dvs.speed = (dvBytes >> 4) & 0xF
  }

  this.setAllStatExps = function (exp) {
    this.statExp = {
      hp: exp,
      attack: exp,
      defense: exp,
      spclAtk: exp,
      spclDef: exp,
      speed: exp
    }
  }

  this.setAiStatExps = function (aiStatExps) {
    this.statExp.hp = aiStatExps[0]
    this.statExp.attack = aiStatExps[1]
    this.statExp.defense = aiStatExps[2]
    this.statExp.spclAtk = aiStatExps[4]
    this.statExp.spclDef = aiStatExps[4]
    this.statExp.speed = aiStatExps[3]
  }

  this.mainStatCalc = function (statName) {
    const intrinsicStat = 2 * (pokemonData[this.species].baseStats[statName] + this.dvs[statName])
    const statExpBoost = Math.min(Math.ceil(Math.sqrt(this.statExp[statName])), 255) >> 2
    return Math.floor(((intrinsicStat + statExpBoost) * this.level) / 100)
  }

  this.stats = function () {
    const stats = {}
    stats.hp = this.mainStatCalc('hp') + this.level + 10
    stats.attack = this.mainStatCalc('attack') + 5
    stats.defense = this.mainStatCalc('defense') + 5
    stats.spclAtk = this.mainStatCalc('spclAtk') + 5
    stats.spclDef = this.mainStatCalc('spclDef') + 5
    stats.speed = this.mainStatCalc('speed') + 5
    return stats
  }

  this.isShiny = function () {
    if (this.dvs.speed !== 10) {
      return false
    }
    if (this.dvs.defense !== 10) {
      return false
    }
    if (this.dvs.spclAtk !== 10) {
      return false
    }
    return (this.dvs.attack % 4) >= 2
  }

  this.gender = function () {
    const ratio = pokemonData[this.species].genderRatio
    if (ratio === 255) {
      return ''
    }
    const maleCutoffs = {
      0: 0,
      31: 2,
      63: 4,
      127: 8,
      191: 12,
      254: 16
    }
    if (this.dvs.attack >= maleCutoffs[ratio]) {
      return '<span class="male">♂</span>'
    }
    return '<span class="female">♀</span>'
  }

  this.name = function () {
    let name = `L${this.level} ${pokemonData[this.species].name}`
    if (this.species === 25 && this.isTalkingPikachu) {
      name = `L${this.level} Talking Pikachu`
    }
    if (this.isShiny()) {
      name += '<span class="shiny-star">★</span>'
    }
    if (this.gender() !== '') {
      name += ` ${this.gender()}`
    }
    return name
  }
}

function getSuitablePokes (team, type, division) {
  const targetBaseStatTotals = [280, 360, 447, 507]

  let allowedSpecies = []
  if (type !== -1) {
    allowedSpecies = possiblePokes[division][type]
  } else {
    const bannedTypes = team.flatMap(p => pokemonData[p.species].types)
    allowedSpecies = allPossiblePokes[division].filter(item => !pokemonData[item].types.filter(value => bannedTypes.includes(value)).length)
  }
  const teamSpecies = team.map(item => item.species)
  allowedSpecies = allowedSpecies.filter(item => !teamSpecies.includes(item))

  let baseStatAverage = 0
  if (team.length) {
    const baseStatTotal = team.reduce((total, pogey) => total + pokemonData[pogey.species].baseStatTotal, 0)
    baseStatAverage = Math.floor(baseStatTotal / team.length)
  }
  const targetBst = targetBaseStatTotals[division]

  const belowAverageBst = allowedSpecies.filter(p => pokemonData[p].baseStatTotal < baseStatAverage)
  const atLeastAverageBst = allowedSpecies.filter(p => pokemonData[p].baseStatTotal >= baseStatAverage)

  if (targetBst < baseStatAverage && belowAverageBst.length) {
    return belowAverageBst
  } else if (targetBst >= baseStatAverage && !atLeastAverageBst.length) {
    return belowAverageBst
  }
  return atLeastAverageBst
}

function MovePool (moves, pokemon, ai) {
  this.signatureMoves = []
  this.goodSupportMoves = []
  this.badSupportMoves = []
  this.goodFirstTypeStabAttacks = []
  this.goodSecondTypeStabAttacks = []
  this.goodNonStabPhysicalAttacks = []
  this.goodNonStabSpecialAttacks = []
  this.badFirstTypeStabAttacks = []
  this.badSecondTypeStabAttacks = []
  this.badNonStabPhysicalAttacks = []
  this.badNonStabSpecialAttacks = []

  const [firstType, secondType] = pokemonData[pokemon.species].types

  for (const move of moves) {
    if (ai !== -1 && aiData[ai].signatureMoves.includes(move)) {
      this.signatureMoves.push(move)
      continue
    }
    if (goodSupportMoves.includes(move)) {
      this.goodSupportMoves.push(move)
      continue
    }
    if (badSupportMoves.includes(move)) {
      this.badSupportMoves.push(move)
      continue
    }
    const moveType = moveData[move].type
    if (goodAttacks.includes(move)) {
      if (moveType === firstType) {
        this.goodFirstTypeStabAttacks.push(move)
      } else if (moveType === secondType) {
        this.goodSecondTypeStabAttacks.push(move)
      } else if (moveType < 10) {
        this.goodNonStabPhysicalAttacks.push(move)
      } else {
        this.goodNonStabSpecialAttacks.push(move)
      }
    }
    if (badAttacks.includes(move)) {
      if (moveType === firstType) {
        this.badFirstTypeStabAttacks.push(move)
      } else if (moveType === secondType) {
        this.badSecondTypeStabAttacks.push(move)
      } else if (moveType < 10) {
        this.badNonStabPhysicalAttacks.push(move)
      } else {
        this.badNonStabSpecialAttacks.push(move)
      }
    }
  }

  this.removeFromAttacks = function (move) {
    this.goodFirstTypeStabAttacks.filter(item => item !== move)
    this.goodSecondTypeStabAttacks.filter(item => item !== move)
    this.goodNonStabPhysicalAttacks.filter(item => item !== move)
    this.goodNonStabSpecialAttacks.filter(item => item !== move)
    this.badFirstTypeStabAttacks.filter(item => item !== move)
    this.badSecondTypeStabAttacks.filter(item => item !== move)
    this.badNonStabPhysicalAttacks.filter(item => item !== move)
    this.badNonStabSpecialAttacks.filter(item => item !== move)
  }

  this.improveChanceOfCompletedCombo = function (move) {
    const arrays = [
      this.signatureMoves,
      this.goodSupportMoves,
      this.badSupportMoves,
      this.goodFirstTypeStabAttacks,
      this.goodSecondTypeStabAttacks,
      this.goodNonStabPhysicalAttacks,
      this.goodNonStabSpecialAttacks,
      this.badFirstTypeStabAttacks,
      this.badSecondTypeStabAttacks,
      this.badNonStabPhysicalAttacks,
      this.badNonStabSpecialAttacks
    ]
    for (const combo of moveCombos) {
      if (combo[0] !== move) {
        continue
      }
      for (const array of arrays) {
        if (array.includes(combo[1])) {
          for (let k = 0; k < combo[2]; k++) {
            array.push(combo[1])
          }
        }
      }
      return
    }
  }
}

function decideFirstMoveArray (movePool, prng) {
  if (movePool.goodFirstTypeStabAttacks.length) {
    if (!prng.randBit() && movePool.goodSecondTypeStabAttacks.length) {
      return movePool.goodSecondTypeStabAttacks
    }
    return movePool.goodFirstTypeStabAttacks
  }
  if (movePool.goodSecondTypeStabAttacks.length) {
    return movePool.goodSecondTypeStabAttacks
  }
  if (movePool.badFirstTypeStabAttacks.length) {
    if (!prng.randBit() && movePool.badSecondTypeStabAttacks.length) {
      return movePool.badSecondTypeStabAttacks
    }
    return movePool.badFirstTypeStabAttacks
  }
  if (movePool.badSecondTypeStabAttacks.length) {
    return movePool.badSecondTypeStabAttacks
  }
  if (movePool.goodNonStabPhysicalAttacks.length) {
    if (!prng.randBit() && movePool.goodNonStabSpecialAttacks.length) {
      return movePool.goodNonStabSpecialAttacks
    }
    return movePool.goodNonStabPhysicalAttacks
  }
  if (movePool.goodNonStabSpecialAttacks.length) {
    return movePool.goodNonStabSpecialAttacks
  }
  if (movePool.badNonStabPhysicalAttacks.length) {
    if (!prng.randBit() && movePool.badNonStabSpecialAttacks.length) {
      return movePool.badNonStabSpecialAttacks
    }
    return movePool.badNonStabPhysicalAttacks
  }
  if (movePool.badNonStabSpecialAttacks.length) {
    return movePool.badNonStabSpecialAttacks
  }
  // Should be unreachable, but for the sake of replicating Stadium 2 the logic is structured in this way
  throw new Error('Unable to decide a movePool array')
}

function addFirstMove (pokemon, movePool, prng) {
  const firstMoveArray = decideFirstMoveArray(movePool, prng)
  if (firstMoveArray.length) {
    pokemon.moves[0] = prng.selectFromArray(firstMoveArray)
    movePool.removeFromAttacks(pokemon.moves[0])
  }
}

function addSecondMove (pokemon, movePool, prng) {
  const firstMoveType = moveData[pokemon.moves[0]].type
  const types = pokemonData[pokemon.species].types
  if (types[0] !== types[1]) {
    if (firstMoveType === types[1] && movePool.badFirstTypeStabAttacks.length) {
      pokemon.moves[1] = prng.selectFromArray(movePool.badFirstTypeStabAttacks)
      movePool.removeFromAttacks(pokemon.moves[1])
      return
    } else if (firstMoveType === types[0] && movePool.badSecondTypeStabAttacks.length) {
      pokemon.moves[1] = prng.selectFromArray(movePool.badSecondTypeStabAttacks)
      movePool.removeFromAttacks(pokemon.moves[1])
      return
    }
  }
  let viableNonStabMoves = movePool.goodNonStabPhysicalAttacks.concat(movePool.goodNonStabSpecialAttacks)
  viableNonStabMoves = viableNonStabMoves.filter(item => moveData[item].type !== firstMoveType)
  if (viableNonStabMoves.length) {
    pokemon.moves[1] = prng.selectFromArray(viableNonStabMoves)
    return
  }
  let sourceArray = movePool.goodNonStabPhysicalAttacks
  const randomBit = prng.randBit()
  if (movePool.goodNonStabSpecialAttacks.length) {
    if (!randomBit || !movePool.goodNonStabPhysicalAttacks.length) {
      sourceArray = movePool.goodNonStabSpecialAttacks
    }
  }
  if (sourceArray.length) {
    pokemon.moves[1] = prng.selectFromArray(sourceArray)
    movePool.removeFromAttacks(pokemon.moves[1])
  }
}

function addThirdMove (pokemon, movePool, prng, team) {
  if (movePool.signatureMoves.length) {
    pokemon.moves[2] = prng.selectFromArray(movePool.signatureMoves)
    movePool.signatureMoves = movePool.signatureMoves.filter(item => item !== pokemon.moves[2])
  } else if (!movePool.goodSupportMoves.length) {
    if (movePool.badSupportMoves.length) {
      pokemon.moves[2] = prng.selectFromArray(movePool.badSupportMoves)
      movePool.badSupportMoves = movePool.badSupportMoves.filter(item => item !== pokemon.moves[2])
    }
  } else {
    let goodSupportMove = prng.selectFromArray(movePool.goodSupportMoves)
    const supportOnAnotherPoke = team.some(p => p.moves.includes(goodSupportMove))
    if (supportOnAnotherPoke) {
      goodSupportMove = prng.selectFromArray(movePool.goodSupportMoves)
    }
    pokemon.moves[2] = goodSupportMove
    movePool.goodSupportMoves = movePool.goodSupportMoves.filter(item => item !== goodSupportMove)
  }
}

function addFourthMove (pokemon, movePool, prng) {
  const primaryMoveTypes = pokemon.moves.slice(0, 2).map(m => moveData[m].type)
  const baseStats = pokemonData[pokemon.species].baseStats
  let viableNonStabMoves = []
  if ((baseStats.spclAtk <= baseStats.attack) || !movePool.badNonStabSpecialAttacks.length) {
    viableNonStabMoves = movePool.badNonStabPhysicalAttacks.filter(item => !primaryMoveTypes.includes(moveData[item].type))
  }
  if ((baseStats.attack <= baseStats.spclAtk) || !movePool.badNonStabPhysicalAttacks.length) {
    viableNonStabMoves = viableNonStabMoves.concat(movePool.badNonStabSpecialAttacks.filter(item => !primaryMoveTypes.includes(moveData[item].type)))
  }
  let sourceArray = movePool.badSupportMoves
  if ((viableNonStabMoves.length && prng.randBit()) || !sourceArray.length) {
    sourceArray = viableNonStabMoves
  }
  if (sourceArray.length) {
    pokemon.moves[3] = prng.selectFromArray(sourceArray)
  }
}

function addMoves (pokemon, team, ai, round, prng) {
  if (pokemon.species === 132) {
    pokemon.moves[0] = 144
    return
  }
  if (pokemon.species === 202) {
    pokemon.moves = [68, 243, 219, 194]
    return
  }

  let moves = pokemonData[pokemon.species].roundOneMoves
  if (round === 2) {
    moves = pokemonData[pokemon.species].roundTwoMoves
  }
  const movePool = new MovePool(moves, pokemon, ai)

  addFirstMove(pokemon, movePool, prng)
  movePool.improveChanceOfCompletedCombo(pokemon.moves[0])

  addSecondMove(pokemon, movePool, prng)
  movePool.improveChanceOfCompletedCombo(pokemon.moves[1])

  addThirdMove(pokemon, movePool, prng, team)
  movePool.improveChanceOfCompletedCombo(pokemon.moves[2])

  addFourthMove(pokemon, movePool, prng)
}

function addHeldItem (pokemon, team, prng) {
  const berries = [74, 78, 79, 80, 83, 84, 109, 139, 174, 150]
  const exclusiveItemSpecies = [25, 83, 104, 105, 113, 132]
  const exclusiveItems = { 25: 163, 83: 105, 104: 118, 105: 118, 113: 30, 132: 35 }
  const haxItems = [3, 73, 82, 140]
  const setDamageMoves = [49, 68, 69, 82, 101, 149, 162, 220, 243]
  const typeBoostItems = [170, 98, 77, 81, 76, 125, 88, 113, 143, -1, 138, 95, 117, 108, 96, 107, 151, 102]

  while (true) {
    const randByte = prng.randByte()
    if (randByte >= 243 && exclusiveItemSpecies.includes(pokemon.species)) {
      item = exclusiveItems[pokemon.species]
    } else if (randByte >= 205) {
      item = haxItems[prng.rand() % 4]
    } else if ((randByte < 116) || setDamageMoves.includes(pokemon.moves[0])) {
      item = berries[prng.rand() % 10]
    } else {
      const moveType = moveData[pokemon.moves[0]].type
      item = typeBoostItems[moveType]
      if (moveType === 0) {
        if (prng.randBit()) {
          item = 104
        }
      } else if (moveType === 16) {
        if (prng.randBit()) {
          item = 144
        }
      }
    }
    if (team.some(p => p.heldItem === item)) {
      continue
    }
    const pokemonTypes = pokemonData[pokemon.species].types
    if (item === 74 && (pokemonTypes.includes(3) || pokemonTypes.includes(8))) {
      continue
    } else if (item === 79 && pokemonTypes.includes(15)) {
      continue
    } else if (item === 80 && pokemonTypes.includes(10)) {
      continue
    }
    pokemon.heldItem = item
    return
  }
}

function shuffleMoves (pokemon, prng) {
  let moveCount = pokemon.moves.findIndex(move => move === 0)
  if (moveCount === -1) {
    moveCount = 4
  }
  if (moveCount < 2) {
    return
  }
  for (let i = 0; i < 3; i++) {
    const index = prng.rand() % moveCount;
    [pokemon.moves[0], pokemon.moves[index]] = [pokemon.moves[index], pokemon.moves[0]]
  }
}

function shuffleTeam (team, prng) {
  for (let i = 0; i < 10; i++) {
    const slot = prng.rand() % 6;
    [team[0], team[slot]] = [team[slot], team[0]]
  }
}

function generateTeam (countRegister, division, round, ai) {
  const divisionLevels = [30, 45, 60, 75]

  const prng = new Prng(countRegister)
  let template = []
  if (ai === -1) {
    template = playerTemplates[prng.rand() % 6]
  } else {
    template = aiData[ai].template
  }

  const team = []
  for (let i = 0; i < 6; i++) {
    const pokeArray = getSuitablePokes(team, template[i], division)
    const species = prng.selectFromArray(pokeArray)
    const newPokemon = new Pokemon(species)
    addMoves(newPokemon, team, ai, round, prng)
    addHeldItem(newPokemon, team, prng)
    prng.rand()
    shuffleMoves(newPokemon, prng)
    newPokemon.level = divisionLevels[division]
    if (ai === -1) {
      newPokemon.setAllStatExps(Math.floor((680 - pokemonData[newPokemon.species].baseStatTotal) * 65535 / 500))
    } else if (round === 1) {
      newPokemon.setAiStatExps(aiData[ai].roundOneStatExp)
    } else {
      newPokemon.setAiStatExps(aiData[ai].roundTwoStatExp)
    }
    newPokemon.changeDvs(prng.randShort())
    newPokemon.unknownValue = prng.randByte()
    if (newPokemon.species === 25) {
      newPokemon.isTalkingPikachu = prng.randByte() === 0
    }
    team.push(newPokemon)
  }
  shuffleTeam(team, prng)

  return team
}

const seedField = document.querySelector('#seed')
const divisionDropdown = document.querySelector('#division')
const trainerDropdown = document.querySelector('#trainer')
const makeTeamButton = document.querySelector('#makeTeamBtn')
const teamOutput = document.querySelector('#team')

seedField.addEventListener('input', fixSeed)
makeTeamButton.addEventListener('click', generateAndDisplayTeam)
divisionDropdown.addEventListener('change', fillTrainers)
fillTrainers()
createNewSeed()
generateAndDisplayTeam()

function fixSeed () {
  const regex = /[^0-9a-fA-F]/g
  seedField.value = seedField.value.replace(regex, '').slice(0, 8).toUpperCase()
}

function fillTrainers () {
  const divisionRoundFromOption = {
    'poke-r1': [0, 1],
    'great-r1': [1, 1],
    'ultra-r1': [2, 1],
    'master-r1': [3, 1],
    'poke-r2': [0, 2],
    'great-r2': [1, 2],
    'ultra-r2': [2, 2],
    'master-r2': [3, 2]
  }
  const [division, round] = divisionRoundFromOption[divisionDropdown.value]
  let roundNameKey = 'roundOneName'
  if (round === 2) {
    roundNameKey = 'roundTwoName'
  }
  for (let i = 1; i < trainerDropdown.length; i++) {
    trainerDropdown[i].text = aiData[8 * division + i - 1][roundNameKey]
  }
}

function createNewSeed () {
  const seed = Math.floor(Math.random() * 0x100000000)
  seedField.value = ('0000000' + seed.toString(16).toUpperCase()).slice(-8)
}

function generateAndDisplayTeam () {
  let seed = 0
  if (seedField.value) {
    seed = parseInt(seedField.value, 16)
  }
  const division = divisionDropdown.selectedIndex % 4
  const round = Math.floor(divisionDropdown.selectedIndex / 4) + 1
  let ai = parseInt(trainerDropdown.value)
  if (ai !== -1) {
    ai += 8 * division
  }
  const team = generateTeam(seed, division, round, ai)
  for (let i = 0; i < 6; i++) {
    fillInPokemon(teamOutput.children[i], team[i])
  }
  createNewSeed()
}

function fillInPokemon (element, pokemon) {
  element.querySelector('.name').innerHTML = pokemon.name()
  const x = 64 * (252 - pokemon.species)
  const y = pokemon.isShiny() ? 64 : 0
  element.querySelector('.sprite').style.backgroundPosition = `${x}px ${y}px`
  element.querySelector('.heldItem').textContent = itemNames[pokemon.heldItem]
  fillInStats(element.querySelector('.stats'), pokemon.stats())
  fillInMoves(element.querySelector('.moves'), pokemon.moves)
}

function fillInStats (element, stats) {
  for (const row of element.querySelectorAll('tr')) {
    row.querySelector('.stat').textContent = stats[row.className]
  }
}

function fillInMoves (element, moves) {
  const moveElements = element.querySelectorAll('li')
  for (let i = 0; i < 4; i++) {
    moveElements[i].textContent = moveData[moves[i]].name
  }
}
