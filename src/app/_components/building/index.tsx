'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Image from "next/image"
import * as Tone from "tone"
import {
  BPM,
  INSTRUMENTS,
  InstrumentDefinition,
  InstrumentKey,
  LOOP_LENGTH,
} from "./instrumentSequences"
import "./styles.css"
import Fence from '../fence'

const DEFAULT_PANEL_SIZE = 160
const MIN_PANEL_SIZE = 0
const MAX_PANEL_SIZE = 260
const FENCE_HEIGHT = 350
const IMAGE_NAMES = [
  '16_pj15io', '15_rfjegt', '14_d8yuf1', '13_fzwnmb',
  '12_eb1ljl', '11_waw9w5', '10_mrz1oj', '9_ma56jf',
  '8_jiqtvo', '7_avnnkk', '6_nraavc', '4_nvqvls',
  '5_hqcyup', '3_qvwlld', '2_hysdkt', '1_tbagml'
]
const START_SCREEN_DELAY = 1500

type InstrumentUIState = {
  instrumentKey: InstrumentKey
  selectedIndex: number
  enabled: boolean
}

type InstrumentVolumes = Record<InstrumentKey, number>

interface DrumKitContext {
  kick: Tone.MembraneSynth
  snare: Tone.NoiseSynth
  hat: Tone.MetalSynth
  bus: Tone.Gain
  hatFilter: Tone.Filter
}

interface ToneContext {
  parts: Tone.Part[]
  guitar?: Tone.PolySynth
  guitarBus?: Tone.Gain
  guitarChorus?: Tone.Chorus
  synth?: Tone.PolySynth
  synthBus?: Tone.Gain
  synthDelay?: Tone.FeedbackDelay
  bass?: Tone.MonoSynth
  bassBus?: Tone.Gain
  drumKit?: DrumKitContext
  master?: Tone.Gain
  compressor?: Tone.Compressor
  reverb?: Tone.Reverb
  mixBus?: Tone.Gain
  wind?: Tone.Noise
  windGain?: Tone.Gain
  windFilter?: Tone.Filter
}

const toneContext: ToneContext = {
  parts: [],
}

const instrumentMap = new Map<InstrumentKey, InstrumentDefinition>(
  INSTRUMENTS.map((instrument) => [instrument.key, instrument])
)

const MAX_INTERACTIVE_COLUMNS = Math.max(
  ...INSTRUMENTS.map((instrument) => instrument.sequences.length)
)

const DEFAULT_VOLUMES: InstrumentVolumes = {
  guitar: 0.75,
  synth: 0.62,
  bass: 0.82,
  drums: 0.88,
}

const disposeToneResources = (options?: { keepWind?: boolean }) => {
  toneContext.parts.forEach((part) => part.dispose())
  toneContext.parts = []

  toneContext.guitar?.dispose()
  toneContext.guitar = undefined
  toneContext.guitarBus?.dispose()
  toneContext.guitarBus = undefined
  toneContext.guitarChorus?.dispose()
  toneContext.guitarChorus = undefined

  toneContext.synth?.dispose()
  toneContext.synth = undefined
  toneContext.synthBus?.dispose()
  toneContext.synthBus = undefined
  toneContext.synthDelay?.dispose()
  toneContext.synthDelay = undefined

  toneContext.bass?.dispose()
  toneContext.bass = undefined
  toneContext.bassBus?.dispose()
  toneContext.bassBus = undefined

  if (toneContext.drumKit) {
    toneContext.drumKit.kick.dispose()
    toneContext.drumKit.snare.dispose()
    toneContext.drumKit.hat.dispose()
    toneContext.drumKit.hatFilter.dispose()
    toneContext.drumKit.bus.dispose()
    toneContext.drumKit = undefined
  }

  toneContext.mixBus?.dispose()
  toneContext.mixBus = undefined
  toneContext.reverb?.dispose()
  toneContext.reverb = undefined
  toneContext.compressor?.dispose()
  toneContext.compressor = undefined
  toneContext.master?.dispose()
  toneContext.master = undefined

  if (!options?.keepWind) {
    toneContext.wind?.stop()
    toneContext.wind?.dispose()
    toneContext.wind = undefined
    toneContext.windFilter?.dispose()
    toneContext.windFilter = undefined
    toneContext.windGain?.dispose()
    toneContext.windGain = undefined
  }
}

const ensureWind = () => {
  if (toneContext.wind) return

  const wind = new Tone.Noise('brown')
  const windFilter = new Tone.Filter(400, 'lowpass')
  const gain = new Tone.Gain(0.02).toDestination()

  wind.chain(windFilter, gain)
  wind.start()

  toneContext.wind = wind
  toneContext.windFilter = windFilter
  toneContext.windGain = gain
}

interface BuildingProps {
  onSelectionChange?: (info: string) => void
}

export default function Building({ onSelectionChange }: BuildingProps) {
  const [images, setImages] = useState<string[]>([])
  const [instrumentStates, setInstrumentStates] = useState<InstrumentUIState[]>(() =>
    INSTRUMENTS.map((instrument) => ({
      instrumentKey: instrument.key,
      selectedIndex: 0,
      enabled: false,
    }))
  )
  const [instrumentVolumes, setInstrumentVolumes] = useState<InstrumentVolumes>({ ...DEFAULT_VOLUMES })
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null)
  const [showStart, setShowStart] = useState(false)
  const [ready, setReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [totalFacadeColumns, setTotalFacadeColumns] = useState<number>(MAX_INTERACTIVE_COLUMNS + 8)
  const [panelSize, setPanelSize] = useState<number>(DEFAULT_PANEL_SIZE)

  const instrumentVolumesRef = useRef<InstrumentVolumes>({ ...DEFAULT_VOLUMES })
  const shouldPlayRef = useRef(true)

  useEffect(() => {
    const timeout = setTimeout(() => setShowStart(true), START_SCREEN_DELAY)

    Promise.all(
      IMAGE_NAMES.map((name) =>
        fetch(`https://res.cloudinary.com/dtecpsig5/image/upload/v1744922987/post-punk/${name}`)
          .then((res) => res.blob())
      )
    ).then((blobs) => {
      const urls = blobs.map((blob) => URL.createObjectURL(blob))
      setImages(urls)
    })

    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    return () => {
      images.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [images])

  useEffect(() => {
    const recalcPanelSize = () => {
      if (typeof window === 'undefined') return
      const available = window.innerHeight - FENCE_HEIGHT
      const calculated = Math.round(available / 4)
      const clamped = Math.max(MIN_PANEL_SIZE, Math.min(MAX_PANEL_SIZE, calculated))
      setPanelSize(clamped)
    }

    recalcPanelSize()
    window.addEventListener('resize', recalcPanelSize)
    return () => window.removeEventListener('resize', recalcPanelSize)
  }, [])

  useEffect(() => {
    const updateFacadeColumns = () => {
      if (typeof window === 'undefined') return
      const width = window.innerWidth
      const columns = Math.ceil(width / panelSize) + 6
      setTotalFacadeColumns(Math.max(columns, MAX_INTERACTIVE_COLUMNS + 6))
    }

    updateFacadeColumns()
    window.addEventListener('resize', updateFacadeColumns)
    return () => window.removeEventListener('resize', updateFacadeColumns)
  }, [panelSize])

  const startComposition = useCallback(async (states: InstrumentUIState[]) => {
    await Tone.start()

    Tone.Transport.stop()
    Tone.Transport.cancel()
    Tone.Transport.loop = false

    disposeToneResources({ keepWind: true })

    const master = new Tone.Gain(0.7).toDestination()
    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 3,
      attack: 0.01,
      release: 0.25,
    }).connect(master)
    const reverb = new Tone.Reverb({ decay: 7, wet: 0.35 }).connect(compressor)
    const mixBus = new Tone.Gain(1).connect(reverb)

    toneContext.master = master
    toneContext.compressor = compressor
    toneContext.reverb = reverb
    toneContext.mixBus = mixBus

    ensureWind()

    const activeStates = states.filter((state) => state.enabled)
    if (activeStates.length === 0) {
      setIsPlaying(false)
      shouldPlayRef.current = false
      return
    }

    activeStates.forEach((state) => {
      const definition = instrumentMap.get(state.instrumentKey)
      if (!definition) return

      const sequence = definition.sequences[state.selectedIndex]
      if (!sequence) return

      if (definition.key === 'guitar') {
        const volume = instrumentVolumesRef.current?.guitar ?? DEFAULT_VOLUMES.guitar
        const bus = new Tone.Gain(volume).connect(mixBus)
        const chorus = new Tone.Chorus({ frequency: 1.8, delayTime: 1.4, depth: 0.35 }).start()
        const guitar = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.4 },
          volume: -8,
        })
        guitar.chain(chorus, bus)

        toneContext.guitar = guitar
        toneContext.guitarBus = bus
        toneContext.guitarChorus = chorus

        const part = new Tone.Part((time, event) => {
          if (event.type !== 'melodic' || !toneContext.guitar) return
          toneContext.guitar.triggerAttackRelease(event.notes, event.duration, time, event.velocity ?? 0.65)
        }, sequence.events).start(0)

        part.loop = true
        part.loopEnd = LOOP_LENGTH
        toneContext.parts.push(part)
        return
      }

      if (definition.key === 'synth') {
        const volume = instrumentVolumesRef.current?.synth ?? DEFAULT_VOLUMES.synth
        const bus = new Tone.Gain(volume).connect(mixBus)
        const delay = new Tone.FeedbackDelay('8n', 0.28)
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.4, decay: 0.6, sustain: 0.65, release: 2.8 },
          volume: -12,
        })
        synth.chain(delay, bus)

        toneContext.synth = synth
        toneContext.synthBus = bus
        toneContext.synthDelay = delay

        const part = new Tone.Part((time, event) => {
          if (event.type !== 'melodic' || !toneContext.synth) return
          toneContext.synth.triggerAttackRelease(event.notes, event.duration, time, event.velocity ?? 0.45)
        }, sequence.events).start(0)

        part.loop = true
        part.loopEnd = LOOP_LENGTH
        toneContext.parts.push(part)
        return
      }

      if (definition.key === 'bass') {
        const volume = instrumentVolumesRef.current?.bass ?? DEFAULT_VOLUMES.bass
        const bus = new Tone.Gain(volume).connect(mixBus)
        const bass = new Tone.MonoSynth({
          oscillator: { type: 'square' },
          filter: { type: 'lowpass', frequency: 200, rolloff: -24 },
          filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.6, baseFrequency: 80, octaves: 2 },
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.8 },
          volume: -6,
        })
        bass.connect(bus)

        toneContext.bass = bass
        toneContext.bassBus = bus

        const part = new Tone.Part((time, event) => {
          if (event.type !== 'melodic' || !toneContext.bass) return
          const note = event.notes[0]
          toneContext.bass.triggerAttackRelease(note, event.duration, time, event.velocity ?? 0.8)
        }, sequence.events).start(0)

        part.loop = true
        part.loopEnd = LOOP_LENGTH
        toneContext.parts.push(part)
        return
      }

      if (definition.key === 'drums') {
        const volume = instrumentVolumesRef.current?.drums ?? DEFAULT_VOLUMES.drums
        const bus = new Tone.Gain(volume).connect(mixBus)
        const kick = new Tone.MembraneSynth({
          pitchDecay: 0.01,
          octaves: 5,
          oscillator: { type: 'sine' },
          envelope: { attack: 0.001, decay: 0.5, sustain: 0.0, release: 0.25 },
        }).connect(bus)
        const snare = new Tone.NoiseSynth({
          noise: { type: 'pink' },
          envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.1 },
        }).connect(bus)
        const hatFilter = new Tone.Filter(8000, 'highpass').connect(bus)
        const hat = new Tone.MetalSynth({
          frequency: 180,
          envelope: { attack: 0.001, decay: 0.12, release: 0.1 },
          harmonicity: 5.1,
          modulationIndex: 32,
          resonance: 4000,
          octaves: 1.5,
          volume: -8,
        } as never).connect(hatFilter)

        toneContext.drumKit = { kick, snare, hat, hatFilter, bus }

        const part = new Tone.Part((time, event) => {
          if (event.type !== 'drum' || !toneContext.drumKit) return
          const velocity = event.velocity ?? 0.85
          if (event.drum === 'kick') {
            toneContext.drumKit.kick.triggerAttackRelease('C1', event.duration ?? '8n', time, velocity)
            return
          }
          if (event.drum === 'snare') {
            toneContext.drumKit.snare.triggerAttackRelease(event.duration ?? '8n', time, velocity)
            return
          }
          toneContext.drumKit.hat.triggerAttackRelease('16n', time, velocity)
        }, sequence.events).start(0)

        part.loop = true
        part.loopEnd = LOOP_LENGTH
        toneContext.parts.push(part)
      }
    })

    if (toneContext.parts.length === 0) {
      return
    }

    Tone.Transport.bpm.value = BPM
    Tone.Transport.loop = true
    Tone.Transport.loopEnd = LOOP_LENGTH
    Tone.Transport.position = 0

    if (shouldPlayRef.current) {
      Tone.Transport.start()
      setIsPlaying(true)
    } else {
      setIsPlaying(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    startComposition(instrumentStates)
  }, [ready, instrumentStates, startComposition])

  useEffect(() => {
    return () => {
      Tone.Transport.stop()
      disposeToneResources()
    }
  }, [])

  const columnIndexes = useMemo(
    () => Array.from({ length: MAX_INTERACTIVE_COLUMNS }, (_, index) => index),
    []
  )

  const activeLabel = useMemo(() => {
    const labels = instrumentStates
      .filter((state) => state.enabled)
      .map((state) => {
        const definition = instrumentMap.get(state.instrumentKey)
        if (!definition) return null
        const sequence = definition.sequences[state.selectedIndex]
        if (!sequence) return null
        return `${definition.displayName}: ${sequence.name}`
      })
      .filter(Boolean) as string[]

    if (labels.length === 0) {
      return 'Кликни по панели, чтобы добавить инструмент в микс'
    }

    return labels.join(' • ')
  }, [instrumentStates])

  const handlePanelClick = (instrumentKey: InstrumentKey, columnIndex: number) => {
    setInstrumentStates((prev) => {
      const next = prev.map((state) => {
        if (state.instrumentKey !== instrumentKey) return state

        const alreadyActive = state.enabled && state.selectedIndex === columnIndex
        if (alreadyActive) {
          return { ...state, enabled: false }
        }

        return {
          ...state,
          selectedIndex: columnIndex,
          enabled: true,
        }
      })

      shouldPlayRef.current = true
      return next
    })
  }

  const handleVolumeChange = (instrumentKey: InstrumentKey, value: number) => {
    const normalized = Math.max(0, Math.min(1, value / 100))
    instrumentVolumesRef.current = {
      ...instrumentVolumesRef.current,
      [instrumentKey]: normalized,
    }
    setInstrumentVolumes((prev) => ({ ...prev, [instrumentKey]: normalized }))

    const applyGain = (gainNode?: Tone.Gain, fallback?: Tone.Gain) => {
      if (gainNode) {
        gainNode.gain.linearRampTo(normalized, 0.1)
      } else if (fallback) {
        fallback.gain.linearRampTo(normalized, 0.1)
      }
    }

    if (instrumentKey === 'guitar') applyGain(toneContext.guitarBus)
    if (instrumentKey === 'synth') applyGain(toneContext.synthBus)
    if (instrumentKey === 'bass') applyGain(toneContext.bassBus)
    if (instrumentKey === 'drums') applyGain(toneContext.drumKit?.bus)
  }

  const handleStopAll = useCallback(() => {
    shouldPlayRef.current = false
    Tone.Transport.stop()
    Tone.Transport.position = 0
    setIsPlaying(false)
  }, [])

  const handlePlayAll = useCallback(async () => {
    shouldPlayRef.current = true
    await Tone.start()
    const hasActive = instrumentStates.some((state) => state.enabled)

    if (!hasActive) {
      const randomizedStates = instrumentStates.map((state) => {
        const definition = instrumentMap.get(state.instrumentKey)
        if (!definition) return state
        const randomIndex = Math.floor(Math.random() * definition.sequences.length)
        return {
          ...state,
          enabled: true,
          selectedIndex: randomIndex,
        }
      })
      setInstrumentStates(randomizedStates)
      return
    }

    if (toneContext.parts.length === 0) {
      startComposition(instrumentStates)
      return
    }

    Tone.Transport.position = 0
    Tone.Transport.start()
    setIsPlaying(true)
  }, [instrumentStates, startComposition])

  const renderStartScreen = () => (
        <div className="startScreen night">
          <iframe
            src="/unlock.html"
            style={{ width: 0, height: 0, border: 'none', position: 'absolute' }}
            allow="autoplay"
          />
          {!showStart ? (
            <div className="loadingText">Загрузка...</div>
          ) : (
            <button className="startButton pixel" onClick={() => setReady(true)}>
              Начать
            </button>
          )}
        </div>
      )

  const [backgroundGrid, setBackgroundGrid] = useState<string[][]>([])

  useEffect(() => {
    if (images.length === 0) return
    const totalColumns = Math.max(totalFacadeColumns, MAX_INTERACTIVE_COLUMNS)
    const rows = INSTRUMENTS.length + 1
    const matrix = Array.from({ length: rows }, () =>
      Array.from({ length: totalColumns }, () => images[Math.floor(Math.random() * images.length)])
    )
    setBackgroundGrid(matrix)
  }, [images, totalFacadeColumns])

  const getBackgroundImage = useCallback(
    (row: number, column: number) => {
      const rowImages = backgroundGrid[row]
      if (rowImages && rowImages[column]) return rowImages[column]
      if (images.length === 0) return undefined
      return images[Math.floor(Math.random() * images.length)]
    },
    [backgroundGrid, images]
  )

  const renderFillerPanels = useCallback(
    (rowKey: number, startColumn: number, count: number, options?: { decorative?: boolean }) =>
      Array.from({ length: Math.max(0, count) }).map((_, index) => {
        const globalColumn = startColumn + index
        const image = getBackgroundImage(rowKey, globalColumn)
        const classNames = ['panelWrapper', 'filler']
        if (options?.decorative) classNames.push('decorative')

        return (
          <div key={`${options?.decorative ? 'decor' : 'filler'}-${rowKey}-${globalColumn}`} className={classNames.join(' ')}>
            {image && <Image src={image} width={panelSize} height={panelSize} alt="panel" />}
          </div>
        )
      }),
    [getBackgroundImage, panelSize]
  )

  const renderGrid = () => {
    const totalColumns = Math.max(totalFacadeColumns, MAX_INTERACTIVE_COLUMNS)
    const leftFillerCount = Math.max(0, Math.floor((totalColumns - MAX_INTERACTIVE_COLUMNS) / 2))
    const rightFillerCount = Math.max(0, totalColumns - MAX_INTERACTIVE_COLUMNS - leftFillerCount)

    return (
      <div
        className="buildingContent"
        style={{
          '--panel-size': `${panelSize}px`,
          '--facade-columns': `${totalColumns}`,
          '--fence-height': `${FENCE_HEIGHT}px`,
        } as React.CSSProperties}
      >
        <div className="moon" aria-hidden="true" />
        <aside className="controlColumn">
          <div className="transportControls">
            <button type="button" className="transportButton" onClick={isPlaying ? handleStopAll : handlePlayAll}>
              {isPlaying ? 'Стоп' : 'Играть'}
            </button>
          </div>
          <div className="infoColumn">
            {INSTRUMENTS.map((instrument) => {
              const state = instrumentStates.find((item) => item.instrumentKey === instrument.key)!
              const sequencePreview = instrument.sequences[state.selectedIndex]

              return (
                <details key={`${instrument.key}-info`} className="infoCard" open>
                  <summary className="infoTitle">
                    <span className="infoInstrument">{instrument.displayName}</span>
                    <span className={`infoSequence ${state.enabled ? 'on' : 'off'}`}>
                      {state.enabled && sequencePreview ? sequencePreview.name : 'вне микса'}
                    </span>
                  </summary>
                  <label className="volumeControl">
                    <span>Громкость</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((instrumentVolumes[instrument.key] ?? DEFAULT_VOLUMES[instrument.key]) * 100)}
                      onChange={(event) => handleVolumeChange(instrument.key, Number(event.target.value))}
                    />
                  </label>
                </details>
              )
            })}
          </div>
        </aside>
        <div className="facadeViewport">
          <div className="facade">
            {INSTRUMENTS.map((instrument, rowIndex) => {
              const state = instrumentStates.find((item) => item.instrumentKey === instrument.key)!

              return (
                <div
                  key={instrument.key}
                  className={`facadeRow ${state.enabled ? 'enabled' : 'muted'}`}
                >
                  <div className="panelRow">
                    {renderFillerPanels(rowIndex, 0, leftFillerCount)}
                    {columnIndexes.map((columnIndex) => {
                      const sequence = instrument.sequences[columnIndex]
                      const isSelected = state.selectedIndex === columnIndex
                      const isActive = state.enabled && isSelected
                      const isHovered = hoveredColumn === columnIndex
                      const globalColumn = leftFillerCount + columnIndex
                      const image = getBackgroundImage(rowIndex, globalColumn)

                      return (
                        <div
                          key={`${instrument.key}-${columnIndex}`}
                          className={[
                            'panelWrapper',
                            'interactive',
                            isSelected ? 'selected' : '',
                            isActive ? 'active' : '',
                            isHovered ? 'columnHover' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => sequence && handlePanelClick(instrument.key, columnIndex)}
                          onMouseEnter={() => setHoveredColumn(columnIndex)}
                          onMouseLeave={() =>
                            setHoveredColumn((current) => (current === columnIndex ? null : current))
                          }
                        >
                          {image && (
                            <Image
                              src={image}
                              width={panelSize}
                              height={panelSize}
                              alt={`${instrument.displayName} option`}
                            />
                          )}
                          <div className="panelOverlay">
                            {sequence && (
                              <span className="panelSequenceLabel">{sequence.name}</span>
                            )}
                            {isActive && state.enabled && (
                              <span className="panelInstrumentLabel">{instrument.displayName}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {renderFillerPanels(rowIndex, leftFillerCount + MAX_INTERACTIVE_COLUMNS, rightFillerCount)}
                  </div>
                </div>
              )
            })}

            <div className="facadeRow decorativeRow">
              <div className="panelRow">
                {renderFillerPanels(
                  INSTRUMENTS.length,
                  0,
                  totalColumns,
                  { decorative: true }
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  useEffect(() => {
    onSelectionChange?.(activeLabel)
  }, [activeLabel, onSelectionChange])

  return (
    <div className={`building ${ready ? 'ready' : ''}`}>
      <div className="overlay" />
      {!ready ? renderStartScreen() : renderGrid()}
      <Snow />
      <Fence />
    </div>
  )
}

const Snow = () => {
  const snowflakes = useMemo(() => {
    return Array.from({ length: 120 }).map((_, index) => {
      const size = Math.random() > 0.5 ? 2 : 3
      return (
        <div
          key={index}
          className="snowflake"
          style={{
            left: `${Math.random() * 100}vw`,
            width: `${size}px`,
            height: `${size}px`,
            animationDuration: `${10 + Math.random() * 10}s`,
            animationDelay: `${Math.random() * 6}s`,
            opacity: Math.random() * 0.5 + 0.3,
          }}
        />
      )
    })
  }, [])

  return <div className="snow">{snowflakes}</div>
}
