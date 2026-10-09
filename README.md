# Tejas Venkatesh - Portfolio

A modern, responsive portfolio website showcasing my journey as a Product Enthusiast and Technology Innovator.

## 🚀 Overview

Personal portfolio featuring my professional experience, education, projects, and leadership achievements. Built with vanilla HTML, CSS, and JavaScript for optimal performance and smooth animations.

## ✨ Features

- **Console-game front end** - A 3D title screen with the four face-button shapes floating around a player card, then one "game mode" per section
- **Section moments** - Huge backlit athletes stand behind the section titles and play the shot head-on: a batsman pulls a short ball, a striker bicycle-kicks the football, a sniper fires the round in bullet time, a pickleball player smashes; the object comes at you and drops into its frame (X and O drop in for Let's Play)
- **Inspectable 3D items** - Drag to spin each item; tap to replay its moment
- **Product / Program / Project reel** - The role word rolls through all three (static under reduced motion)
- **In-page resume viewer** - Renders the PDF with PDF.js so it opens in every browser, including phones without a PDF viewer
- **Shoulder-button tab bar** - L1 / R1 jump between sections; on phones the menu is a pause screen
- **Accessible by default** - Keyboard focus, skip link, reduced-motion support, and full content without JavaScript or WebGL

## 🛠️ Tech Stack

- HTML5, CSS3 (custom properties, grid, variable fonts)
- JavaScript (ES modules)
- Three.js r169 (one WebGL canvas, scissored views, shader-drawn ball patterns)
- GSAP 3 + ScrollTrigger for motion, Lenis for smooth scrolling
- PDF.js (loaded on demand for the resume viewer)
- Fonts: Anybody, Instrument Sans, Martian Mono · Icons: Solar & Simple Icons via Iconify

## 📂 Structure

```
portfolio/
├── index.html          # Markup and content
├── index.css           # Design tokens, layout and components
├── script.js           # Navigation, collapsibles, reveals, resume viewer, tic-tac-toe
├── gl.js               # Three.js scenes (hero shapes + section items)
├── favicon.svg
└── pictures/           # Player card photo, logos and resume
```

## 🎯 Key Sections

- **About** - Title screen and player bio
- **Education** - Save files with real progress bars (Training · Cricket)
- **Experience** - Career-mode timeline: LG Energy Solution Vertech, Dell, TCS, Accenture (Career mode · Football)
- **Projects** - Mission log with expandable details (Missions · Tactical shooter)
- **Leadership** - Rotaract rank progression (Ranked · Pickleball)
- **Let's Play** - Tic-tac-toe against me (Versus)

## 🔗 Connect

- [LinkedIn](https://www.linkedin.com/in/tejas-venkateshli/)
- [GitHub](https://github.com/VenkateshTejas)
- Email: venkatesh.te@northeastern.edu

## 📄 License

© 2026 Tejas Venkatesh. All Rights Reserved.
