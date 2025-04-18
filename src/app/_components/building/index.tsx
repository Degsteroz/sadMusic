'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import * as Tone from 'tone'
import sequences from './melody_named_sequences.json'
import './styles.css'

const BLOCK_SIZE = 200

interface NoteEvent {
  time: string
  note: string
  duration: string
}

interface Sequence {
  name: string
  background: NoteEvent[]
  lead: NoteEvent[]
}

interface BlockData {
  key: string
  imageIndex: number
  sequence: Sequence
}

let melodySynth: Tone.Synth
let pad: Tone.PolySynth
let mainGain: Tone.Gain
let backgroundPart: Tone.Part
let leadPart: Tone.Part
let wind: Tone.Noise
let windGain: Tone.Gain

export default function Building() {
  const [images, setImages] = useState<string[]>([])
  const [gridData, setGridData] = useState<BlockData[][]>([])
  const [activeBlock, setActiveBlock] = useState<BlockData | null>(null)
  const [showStart, setShowStart] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const imageNames = [
      "16_pj15io", "15_rfjegt", "14_d8yuf1", "13_fzwnmb",
      "12_eb1ljl", "11_waw9w5", "10_mrz1oj", "9_ma56jf",
      "8_jiqtvo", "7_avnnkk", "6_nraavc", "4_nvqvls",
      "5_hqcyup", "3_qvwlld", "2_hysdkt", "1_tbagml"
    ]

    const timeout = setTimeout(() => setShowStart(true), 1500)

    Promise.all(
      imageNames.map(name =>
        fetch(`https://res.cloudinary.com/dtecpsig5/image/upload/v1744922987/post-punk/${name}`)
          .then(res => res.blob())
      )
    ).then(blobs => {
      const urls = blobs.map(blob => URL.createObjectURL(blob))
      setImages(urls)
    })

    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!ready || images.length === 0 || gridData.length > 0) return

    const rows = Math.ceil(window.innerHeight / BLOCK_SIZE) + 1
    const cols = Math.ceil(window.innerWidth / BLOCK_SIZE) + 1

    const data: BlockData[][] = []
    const sequenceShuffled = [...sequences]
    for (let i = sequenceShuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[sequenceShuffled[i], sequenceShuffled[j]] = [sequenceShuffled[j], sequenceShuffled[i]]
    }

    let seqCounter = 0
    for (let row = 0; row < rows; row++) {
      const rowArr: BlockData[] = []
      const imageIndices = [...Array(images.length).keys()]
      for (let i = imageIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[imageIndices[i], imageIndices[j]] = [imageIndices[j], imageIndices[i]]
      }

      for (let col = 0; col < cols; col++) {
        const key = `${row}-${col}`
        const imageIndex = imageIndices[col % imageIndices.length]
        const sequence = sequenceShuffled[seqCounter % sequenceShuffled.length]
        rowArr.push({ key, imageIndex, sequence })
        seqCounter++
      }
      data.push(rowArr)
    }

    setGridData(data)
    const first = data[0][0]
    setActiveBlock(first)
    startMelody(first.sequence)
  }, [images, ready, gridData.length])

  const unlockAudio = async () => {
    try {
      await Tone.start()
    } catch (e) {
      console.warn('Audio unlock failed')
    }
  }

  const startMelody = async (sequence: Sequence) => {
    await Tone.start()

    if (Tone.Transport.state === 'started') {
      Tone.Transport.stop()
      Tone.Transport.cancel()
    }

    backgroundPart?.dispose()
    leadPart?.dispose()
    melodySynth?.dispose()
    pad?.dispose()

    melodySynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.4, release: 2 },
      volume: -12
    })

    pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 3, decay: 1, sustain: 0.6, release: 4 },
      volume: -14
    })

    const reverb = new Tone.Reverb({ decay: 8, wet: 0.5 })
    const filter = new Tone.Filter(1000, 'lowpass')
    mainGain = new Tone.Gain(0.08).toDestination()

    melodySynth.chain(reverb, filter, mainGain)
    pad.chain(reverb, filter, mainGain)

    if (!wind) {
      wind = new Tone.Noise("brown")
      windGain = new Tone.Gain(0.02).toDestination()
      const windFilter = new Tone.Filter(400, "lowpass")
      wind.chain(windFilter, windGain)
      wind.start()
    }

    backgroundPart = new Tone.Part((time, value) => {
      const loweredNote = value.note.replace(/(\d)/, (_, d) => `${Math.max(1, parseInt(d) - 1)}`)
      pad.triggerAttackRelease(loweredNote, value.duration, time)
    }, sequence.background).start(0)

    leadPart = new Tone.Part((time, value) => {
      melodySynth.triggerAttackRelease(value.note, value.duration, time)
    }, sequence.lead).start(0)

    backgroundPart.loop = true
    backgroundPart.loopEnd = "4m"
    leadPart.loop = true
    leadPart.loopEnd = "4m"

    Tone.Transport.bpm.value = 72
    Tone.Transport.start()
  }

  const handleBlockClick = (block: BlockData) => {
    setActiveBlock(block)
    startMelody(block.sequence)
  }

  const getContent = () => {
    if (!ready) {
      return (
        <div className="startScreen night" onTouchStart={unlockAudio} onClick={unlockAudio}>
          {!showStart ? (
            <div className="loadingText">Загрузка...</div>
          ) : (
            <button className="startButton pixel" onClick={() => setReady(true)}>
              Начать
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="buildingContent">
        {gridData.map((row, rowIdx) => (
          <div className="buildingRow" key={rowIdx}>
            {row.map((block) => {
              const isActive = block.key === activeBlock?.key
              return (
                <div
                  key={block.key}
                  className={`panelWrapper ${isActive ? 'active' : ''}`}
                  onClick={() => handleBlockClick(block)}
                >
                  <Image
                    src={images[block.imageIndex]}
                    width={BLOCK_SIZE}
                    height={BLOCK_SIZE}
                    alt="panel"
                  />
                </div>
              )
            })}
          </div>
        ))}
        <div className="overlay" />
        <div className="sceneLabel">{activeBlock?.sequence?.name}</div>
      </div>
    )
  }

  return (
    <div className={`building ${ready ? 'ready' : ''}`}>
      {getContent()}
      <Snow />
    </div>
  )
}

const Snow = () => {
  const snowflakes = useMemo(() => {
    return Array.from({ length: 120 }).map((_, i) => {
      const size = Math.random() > 0.5 ? 2 : 3
      return (
        <div
          key={i}
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
