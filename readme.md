# Read Aloud Chrome Extension

Similar to edge's Read Aloud feature, this Chrome extension reads text from any webpage using a custom TTS service like Kokoro ([Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI)) or OpenAI's tts model.

## Demo

![Read Aloud Chrome Extension Control Bar Demo](https://20njezohu8.ufs.sh/f/2SB8NYPqSDh24UHHTfikdn8SB0v5UMKF7EWC9jTa6wH1Xzf3)

<div align="center"> 
<img src="https://20njezohu8.ufs.sh/f/2SB8NYPqSDh2Ls0fezFKIRk1p3hg5KJFG6saCXSQruexV20M" alt="Read Aloud Chrome Extension Popup Demo">
</div>

## ✨ Features

- **Intelligent Text Reading**: Click anywhere on a page to start reading from that point
- **Real-time Word Highlighting**: Visual feedback shows current word being spoken
- **Context Menu Integration**: Right-click to start reading from any position
- **Voice Customization**: Choose from multiple TTS voices and adjust speech speed
- **Smart Navigation**: Automatically continues to next text elements
- **Background Processing**: Efficient audio caching and preloading
- **Control Panel**: Sticky in-page controls for managing playback
- **Dark/Light Theme**: Toggle between themes in the popup
- **Responsive Design**: Works across all websites

## 🚀 Installation

### Development Setup

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd custom_read_aloud
   ```

   **Or download the ZIP file** from [here](https://github.com/shhossain/read_aloud_extension/archive/refs/heads/main.zip) and extract it.

2. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory (where `manifest.json` is located)

## 🎯 Usage

### Basic Usage

1. **Activate the extension**: Click the extension icon and toggle "Active"
2. **Start reading**: Click anywhere on a webpage where you want to start reading
3. **Context menu**: Right-click and select "Read aloud from here"
4. **Control playback**: Use the in-page control panel to pause/resume

### Configuration

#### TTS Settings

- **API Base URL**: Set your text-to-speech service endpoint
- **Voice Selection**: Choose from available voices or enter a custom voice
- **Speech Speed**: Adjust playback speed (0.5x - 2.0x)

#### Themes

- Toggle between light and dark themes via the popup interface

## 🛠️ Technical Architecture

### Core Modules

#### Audio Manager (`src/modules/audioManager.ts`)

- Handles TTS API communication
- Implements audio caching and preloading
- Manages request queue and retry logic
- Supports audio streaming optimization

#### Text Reader (`src/modules/textReader.ts`)

- Orchestrates the reading process
- Manages sentence tokenization
- Handles element traversal and continuation
- Controls audio playback timing

#### Text Highlighter (`src/modules/textHighlighter.ts`)

- Provides real-time word highlighting
- Synchronizes highlights with audio playback
- Manages visual feedback states

#### State Management (`src/modules/state.ts`)

- Central state management with reactivity
- Subscription-based updates
- Cross-module communication

#### DOM Traversal (`src/modules/domTraversal.ts`)

- Smart text element detection
- Handles navigation between readable elements
- Filters out non-content elements

#### Control Panel (`src/modules/controlPanel.ts`)

- In-page UI for playback controls
- Settings management interface
- Voice selection and configuration

### File Structure

```
├── manifest.json              # Extension manifest
├── package.json              # Node.js dependencies
├── rollup.config.js          # Build configuration
├── tsconfig.json             # TypeScript configuration
├── popup.html                # Extension popup UI
├── styles.css                # Global styles
├── images/                   # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.ts         # Service worker
    ├── index.ts              # Content script entry
    ├── popup.ts              # Popup script
    ├── modules/              # Core functionality
    │   ├── audioManager.ts
    │   ├── controlPanel.ts
    │   ├── domTraversal.ts
    │   ├── state.ts
    │   ├── textHighlighter.ts
    │   ├── textProcessor.ts
    │   └── textReader.ts
    └── types/                # TypeScript definitions
        ├── index.d.ts
        └── state.ts
```

## 🔧 Development

### Available Scripts

- `npm run dev`: Development build with watch mode
- `npm run build`: Production build
- `npm run type-check`: TypeScript type checking

### Build System

The extension uses Rollup for bundling with TypeScript support:

- **Entry points**: Background script, content script, popup script
- **Output**: Optimized bundles in `dist/` directory
- **Type checking**: Full TypeScript support with Chrome extension types

### Key Technologies

- **TypeScript**: Type-safe development
- **Rollup**: Module bundling
- **Chrome Extension APIs**: Background scripts, content scripts, storage
- **Web Speech Synthesis**: Browser TTS fallback
- **Custom TTS API**: External service integration

## 🎨 Styling

The extension includes comprehensive CSS with:

- CSS custom properties for theming
- Dark/light mode support
- Responsive design patterns
- Smooth animations and transitions
- Accessible color schemes

## 📡 API Integration

### TTS Service Requirements

The extension expects a TTS service with the following endpoints:

#### Get Voices (Optional)

```
GET /audio/voices
Response: { "voices": ["voice1", "voice2", ...] }
```

#### Generate Speech

```
POST /audio/speech
Body: {
  "model": "kokoro",
  "input": "text to speak",
  "voice": "voice_name",
  "response_format": "mp3",
  "speed": 1.0
}
Response: Audio blob (MP3)
```

## 🔒 Permissions

The extension requires the following permissions:

- `activeTab`: Access current tab content
- `storage`: Save user preferences
- `contextMenus`: Right-click menu integration

## 🐛 Troubleshooting

### Common Issues

1. **No audio playback**: Check TTS API configuration in settings
2. **Highlighting not working**: Ensure the extension is active
3. **Performance issues**: Clear audio cache or reduce preloading

### Debug Mode

Enable debug logging by opening the extension popup and checking the browser console for detailed information about:

- Audio caching operations
- TTS API requests
- State management updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and test thoroughly
4. Commit with descriptive messages
5. Push to your fork and submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Maintain consistent code formatting
- Add appropriate type definitions
- Test across different websites
- Ensure accessibility compliance

## 📄 License

This project is licensed under the ISC License.

## 🔮 Future Enhancements

- [ ] Multiple language support
- [ ] Keyboard shortcuts
- [ ] Reading statistics
- [ ] Export audio functionality
- [ ] Custom highlighting styles

**Note:** Auto generated by `Claude Sonet 4`
