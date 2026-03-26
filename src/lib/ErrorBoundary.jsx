import React from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Page crashed:', error);
    console.error('Error info:', errorInfo);
    this.setState({
      error: error.toString(),
      errorInfo: errorInfo.componentStack
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const isImportError = this.state.error?.includes('Failed to fetch') || this.state.error?.includes('dynamically imported');

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-foreground">
                  {isImportError ? 'Page failed to load' : 'Something went wrong'}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {isImportError
                    ? 'The page could not be fetched. This may be a temporary network issue.'
                    : 'A critical error occurred on this page. The error has been logged.'}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 max-h-32 overflow-auto text-left">
                <p className="text-xs font-mono text-foreground/70 break-words">
                  {this.state.error}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reload page
                </Button>
                <Button
                  onClick={this.handleRetry}
                  variant="outline"
                  className="w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Link to="/" className="w-full">
                  <Button variant="outline" className="w-full">
                    <Home className="w-4 h-4 mr-2" />
                    Go to Marketplace
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;