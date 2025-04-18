'use client'
import React, {useEffect, useState} from 'react';
import Image from 'next/image';

import poster from './poster.png'
import './styles.css';


const baseUrl = 'https://res.cloudinary.com/dtecpsig5/image/upload/v1744922987/post-punk/'


export default function Fence() {
  const [cols, setCols] = useState(0) // по умолчанию

  useEffect(() => {
    const width = window.innerWidth || 1440
    setCols(Math.ceil(width / 300) + 1)
  }, [])

  const elements = Array.from({ length: cols }, (_, i) => (
    <Image
      src={baseUrl + 'c8a626ce-75df-407c-9fd4-7bcc173bd91c'}
      width={300}
      height={350}
      alt="fence"
      key={i}
    />
  ))

  return (
    <div className="fence">
      {elements}
      <Image
        src={poster}
        width={70}
        height={90}
        alt="poster"
        className="poster"
      />
    </div>
  )
}
