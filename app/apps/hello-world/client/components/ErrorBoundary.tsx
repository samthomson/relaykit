import { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1b1e',
          color: '#c1c2c5',
          fontFamily: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
          fontSize: 13,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ marginBottom: 16, color: '#868e96' }}>something went wrong</div>
            <div style={{ marginBottom: 16, fontSize: 11, color: '#868e96' }}>
              {this.state.error?.message}
            </div>
            <button
              onClick={this.handleReset}
              style={{
                padding: '6px 16px',
                background: '#9368d8',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
