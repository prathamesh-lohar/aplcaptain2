import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import LoadingAnimation from './LoadingAnimation';
import './App.css';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL;
const API_URL = process.env.REACT_APP_API_URL;
const PLACEHOLDER_IMAGE = `${SOCKET_URL}uploads/defaultPlayer.png`;
const DEFAULT_TEAM_LOGO = `${SOCKET_URL}uploads/defaultTeam.png`;
function App() {
  const [socket, setSocket] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [pin, setPin] = useState('');
  const [teamData, setTeamData] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [currentBid, setCurrentBid] = useState({ amount: 5, teamName: '' });
  const [timerValue, setTimerValue] = useState(20);
  const [error, setError] = useState('');
  const [bidSuccess, setBidSuccess] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState({
    timerDuration: 20,
    initialBudget: 110,
    basePrice: 30,
    minBasePrice: 30,
    maxSquadSize: 11,
    maxCaptains: 20
  });

  // Fetch config on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        console.log('Fetching config from:', `${API_URL}/config`);
        const response = await fetch(`${API_URL}/config`);
        const data = await response.json();
        console.log('Config received:', data);
        if (data.success) {
          setConfig(data.config);
          console.log('Config updated:', data.config);
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Use default config if fetch fails
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });
    setSocket(newSocket);

    // Connection events
    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Check for saved credentials on mount
    const savedTeamId = localStorage.getItem('captain_teamId');
    const savedPin = localStorage.getItem('captain_pin');
    
    if (savedTeamId && savedPin) {
      setTeamId(savedTeamId);
      setPin(savedPin);
      // Auto-login with saved credentials
      newSocket.emit('team:login', { teamId: savedTeamId, pin: savedPin });
    }

    // Auth events
    newSocket.on('auth:success', (data) => {
      if (data.team) {
        setIsAuthenticated(true);
        setTeamData(data.team);
        setError('');
        setIsLoading(false);
      }
    });

    // Handle current auction state (when reconnecting)
    newSocket.on('auction:state', (data) => {
      console.log('Received auction:state:', data); // Debug log
      if (data.state && data.state.isActive && !data.state.isPaused && data.state.currentPlayer) {
        setCurrentPlayer(data.state.currentPlayer);
        setCurrentBid({
          amount: data.state.currentHighBid?.amount || data.state.currentPlayer.basePrice,
          teamName: data.state.currentHighBid?.team?.teamName || 'Base Price'
        });
        setTimerValue(data.timerValue || 20);
      } else if (data.state && !data.state.isActive) {
        // Clear current player if auction is not active
        setCurrentPlayer(null);
      }
    });

    newSocket.on('auth:error', (data) => {
      setError(data.message);
      setIsLoading(false);
      // Clear invalid credentials
      localStorage.removeItem('captain_teamId');
      localStorage.removeItem('captain_pin');
    });

    // Auction events
    newSocket.on('auction:started', (data) => {
      setCurrentPlayer(data.player);
      setCurrentBid({ amount: data.basePrice, teamName: 'Base Price' });
      setTimerValue(data.timerValue);
      setBidSuccess(false);
    });

    newSocket.on('bid:new', (data) => {
      setCurrentBid({
        amount: data.amount,
        teamName: data.teamName
      });
      // Check if this is our bid and update team data immediately
      if (teamData && data.teamId && teamData.id && data.teamId.toString() === teamData.id.toString()) {
        setBidSuccess(true);
        setTimeout(() => setBidSuccess(false), 2000);
        
        // Update remaining purse immediately
        if (data.team && data.team.remainingPoints !== undefined) {
          setTeamData(prev => ({
            ...prev,
            remainingPoints: data.team.remainingPoints,
            purseBudget: data.team.purseBudget
          }));
        }
      }
    });

    newSocket.on('timer:update', (data) => {
      setTimerValue(data.value);
    });

    newSocket.on('timer:reset', (data) => {
      setTimerValue(data.value);
    });

    newSocket.on('player:sold', (data) => {
      setTeamData(prev => {
        if (prev && data.team && data.team.id && 
            data.team.id.toString() === prev.id.toString()) {
          return {
            ...prev,
            remainingPoints: prev.remainingPoints - data.amount,
            rosterSlotsFilled: prev.rosterSlotsFilled + 1,
            players: [...prev.players, data.player]
          };
        }
        return prev;
      });
      setCurrentPlayer(null);
    });

    newSocket.on('bid:error', (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 3000);
    });

    newSocket.on('bid:success', () => {
      setBidSuccess(true);
      setTimeout(() => setBidSuccess(false), 2000);
    });

    return () => {
      newSocket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - socket should only be created once

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoading(true);
    if (socket) {
      socket.emit('team:login', { teamId, pin });
      // Save credentials on successful manual login
      socket.once('auth:success', () => {
        localStorage.setItem('captain_teamId', teamId);
        localStorage.setItem('captain_pin', pin);
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('captain_teamId');
    localStorage.removeItem('captain_pin');
    setIsAuthenticated(false);
    setTeamData(null);
    setCurrentPlayer(null);
  };

  const handleBid = (increment = 5) => {
    if (!socket || !teamData || !currentPlayer) return;

    const nextBid = currentBid.amount + increment;

    // Validate using the same logic as canBid
    if (!canBid(increment)) {
      const maxAllowed = getMaxAllowedBid();
      const playersNeeded = config.maxSquadSize - teamData.rosterSlotsFilled - 1;
      setError(`Cannot bid ${nextBid}. Max allowed: ${maxAllowed} (need ${playersNeeded * config.minBasePrice} for ${playersNeeded} more players)`);
      setTimeout(() => setError(''), 4000);
      return;
    }

    socket.emit('bid:place', { amount: nextBid });
  };

  const hasNoBids = currentBid.teamName === 'Base Price' || !currentBid.teamName || currentBid.teamName === 'No Bids Yet';

  const getNextBidAmount = (increment = 5) => {
    // If no bids yet and increment is 0, return base price
    if (increment === 0 && hasNoBids) {
      return currentBid.amount;
    }
    return currentBid.amount + increment;
  };

  const canBid = (increment = 5) => {
    if (!teamData || !currentPlayer) return false;
    const nextBid = getNextBidAmount(increment);
    
    // Check if team has enough points for the bid
    if (nextBid > teamData.remainingPoints) return false;
    
    // Check if team can complete roster after this bid
    const remainingAfterBid = teamData.remainingPoints - nextBid;
    const playersStillNeeded = config.maxSquadSize - teamData.rosterSlotsFilled - 1; // -1 for current player
    const minBudgetNeeded = playersStillNeeded * config.minBasePrice;
    
    return remainingAfterBid >= minBudgetNeeded;
  };

  const getMaxAllowedBid = () => {
    if (!teamData || !currentPlayer) return 0;
    const playersStillNeeded = config.maxSquadSize - teamData.rosterSlotsFilled - 1;
    const minBudgetNeeded = playersStillNeeded * config.minBasePrice;
    const maxBid = Math.max(0, teamData.remainingPoints - minBudgetNeeded);
    
    console.log('Max bid calculation:', {
      maxSquadSize: config.maxSquadSize,
      minBasePrice: config.minBasePrice,
      rosterSlotsFilled: teamData.rosterSlotsFilled,
      remainingPoints: teamData.remainingPoints,
      playersStillNeeded,
      minBudgetNeeded,
      maxBid
    });
    
    return maxBid;
  };

  const isHighestBidder = currentBid.teamName === teamData?.teamName;

  if (!isAuthenticated) {
    return (
      <div className="app">
        {/* Loading Animation */}
        {isLoading && <LoadingAnimation message="Logging in..." />}
        
        <div className="login-container">
          <div className="login-card" style={{ position: 'center',
            background: 'rgba(255, 255, 255, 0.9)' }}>
            
          <img src="/assets/main_logo.png" alt="App Logo" style= {{
            alignSelf: 'center',
            left: '50%',
            marginLeft: '80px',
          }
          }
          className="login-logo" />
            <h1 className="app-title" style = {{ marginTop: '-60px' }}> APL Auction</h1>
            <h2>Captain Login</h2>
            
            {/* {!isConnected && (
              <div className="connection-status connecting">
                <span className="status-dot"></span>
                Connecting to server...
              </div>
            )}
            {isConnected && (
              <div className="connection-status connected">
                <span className="status-dot"></span>
                Connected
              </div>
            )}
             */}
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="teamId">Team ID</label>
                <input
                  id="teamId"
                  type="text"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value.toUpperCase())}
                  placeholder="e.g., TEAM01"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="pin">PIN</label>
                <input
                  id="pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                  maxLength="4"
                  pattern="[0-9]{4}"
                  required
                  disabled={isLoading}
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="login-button" disabled={isLoading || !isConnected}>
                {isLoading ? (
                  <>
                    <span className="spinner"></span>
                    Logging in...
                  </>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Show loading if authenticated but teamData not loaded yet
  if (!teamData) {
    return (
      <div className="app">
        <LoadingAnimation message="Loading team data..." />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="captain-dashboard">
        {/* Connection Status Badge */}
        {!isConnected && (
          <div className="connection-warning">
            ⚠️ Connection lost. Reconnecting...
          </div>
        )}

        {/* Header */}
        <div className="dashboard-header">
          <div className="team-info">
            <div className="team-badge">
              <img 
                src={(teamData.logo && teamData.logo.trim() !== '') ? `${SOCKET_URL}${teamData.logo.replace(/^\//, '')}` : DEFAULT_TEAM_LOGO}
                alt={teamData.teamName}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '12px'
                }}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = DEFAULT_TEAM_LOGO;
                }}
              />
            </div>
            <div>
              <h2>{teamData.teamName}</h2>
              <p className="captain-name">👤 {teamData.captainName}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-button">
            <span>🚪</span> Logout
          </button>
        </div>

        {/* Budget Panel */}
        <div className="budget-panel">
          <div className="budget-item">
            <div className="budget-icon">💰</div>
            <div className="budget-details">
              <span className="budget-label">Remaining</span>
              <span className="budget-value">{teamData.remainingPoints}</span>
            </div>
          </div>
          <div className="budget-item">
            <div className="budget-icon">👥</div>
            <div className="budget-details">
              <span className="budget-label">Squad</span>
              <span className="budget-value">{teamData.rosterSlotsFilled}/{config.maxSquadSize}</span>
            </div>
          </div>
          {currentPlayer && (
            <div className="budget-item" style={{ borderLeft: '2px solid #10b981' }}>
              <div className="budget-icon">📊</div>
              <div className="budget-details">
                <span className="budget-label">Max Bid</span>
                <span className="budget-value" style={{ color: '#10b981' }}>{getMaxAllowedBid()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="progress-container">
          <div className="progress-header">
            <span className="progress-label">🏏 Squad Progress</span>
            <span className="progress-percentage">{Math.round((teamData.rosterSlotsFilled / config.maxSquadSize) * 100)}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${(teamData.rosterSlotsFilled / config.maxSquadSize) * 100}%` }}
            >
              <span className="progress-shine"></span>
            </div>
          </div>
          <div className="progress-stats">
            <span>{teamData.rosterSlotsFilled} players</span>
            <span>{config.maxSquadSize - teamData.rosterSlotsFilled} remaining</span>
          </div>
        </div>

        {/* Current Player */}
        {currentPlayer ? (
          <div className="current-player-section">
            <div className="section-header">
              <h3>⚡ Current Auction</h3>
            </div>
            <div className="player-card-mobile">
              <div className="player-photo-wrapper">
                <img 
                  src={(currentPlayer.photo && currentPlayer.photo.trim() !== '' && !currentPlayer.photo.includes('placeholder'))
                    ? (currentPlayer.photo.startsWith('http') 
                        ? currentPlayer.photo 
                        : `${SOCKET_URL}${currentPlayer.photo.replace(/^\/+/, '')}`)
                    : PLACEHOLDER_IMAGE
                  } 
                  alt={currentPlayer.name}
                  className="player-photo-mobile"
                  onError={(e) => { 
                    e.target.onerror = null;
                    e.target.src = PLACEHOLDER_IMAGE; 
                  }}
                />
                <div className="photo-overlay"></div>
              </div>
              <div className="player-info-mobile">
                <h4>{currentPlayer.name}</h4>
                <div className="player-meta">
                  <span className="player-category-mobile">{currentPlayer.category}</span>
                  <span className="player-base-price">Base: {currentPlayer.basePrice}</span>
                </div>
              </div>
            </div>

            {/* Timer */}
            <div className="timer-mobile" data-urgent={timerValue <= 5}>
              <div className="timer-content">
                <span className="timer-icon">{timerValue <= 5 ? '⚠️' : '⏱️'}</span>
                <div className="timer-info">
                  <span className="timer-label">Time Remaining</span>
                  <span className="timer-value-mobile">{timerValue}s</span>
                </div>
              </div>
              <div className="timer-bar" style={{ width: `${(timerValue / 30) * 100}%` }}></div>
            </div>

            {/* Current Bid */}
            <div className="current-bid-mobile" data-my-bid={isHighestBidder}>
              <div className="bid-info">
                <span className="bid-label-mobile">💰 Current Bid</span>
                <span className="bid-amount-mobile">{currentBid.amount}</span>
                <div className="bid-team-info">
                  {isHighestBidder && <span className="winning-badge">🏆 You're Winning!</span>}
                  <span className="bid-team-mobile">{currentBid.teamName}</span>
                </div>
              </div>
            </div>

            {/* Bid Controls */}
            <div className="bid-controls">
              {!isHighestBidder && (
                <div className="max-bid-info" style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}>
                  <span style={{ fontSize: '20px' }}>📊</span>
                  <div style={{ flex: 1 }}>
                    <div>Max you can bid: {getMaxAllowedBid()}</div>
                    <small style={{ fontSize: '11px', opacity: 0.9 }}>
                      {config.maxSquadSize - teamData.rosterSlotsFilled - 1} more players × {config.minBasePrice} reserved
                    </small>
                  </div>
                </div>
              )}
              {isHighestBidder ? (
                <div className="highest-bidder-notice">
                  <div className="notice-icon">🏆</div>
                  <div>
                    <p className="notice-title">You're the Highest Bidder!</p>
                    <small>Wait for other teams to bid or win this player</small>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bid-buttons-group">
                    {hasNoBids && canBid(0) && (
                      <button 
                        className={`bid-button bid-button-base ${bidSuccess ? 'bid-success' : ''}`}
                        onClick={() => handleBid(0)}
                        disabled={!isConnected}
                      >
                        <span className="bid-button-icon">{bidSuccess ? '✓' : '🎯'}</span>
                        <span className="bid-button-text">
                          {bidSuccess ? 'Bid Placed!' : `${getNextBidAmount(0)}`}
                        </span>
                        <span className="bid-button-label">{bidSuccess ? '' : 'Base Price'}</span>
                      </button>
                    )}
                    {canBid(5) && (
                      <button 
                        className={`bid-button ${bidSuccess ? 'bid-success' : ''}`}
                        onClick={() => handleBid(5)}
                        disabled={!isConnected}
                      >
                        <span className="bid-button-icon">{bidSuccess ? '✓' : '💰'}</span>
                        <span className="bid-button-text">
                          {bidSuccess ? 'Bid Placed!' : `${getNextBidAmount(5)}`}
                        </span>
                        <span className="bid-button-label">{bidSuccess ? '' : '+5L'}</span>
                      </button>
                    )}
                    {canBid(10) && (
                      <button 
                        className={`bid-button ${bidSuccess ? 'bid-success' : ''}`}
                        onClick={() => handleBid(10)}
                        disabled={!isConnected}
                      >
                        <span className="bid-button-icon">{bidSuccess ? '✓' : '🚀'}</span>
                        <span className="bid-button-text">
                          {bidSuccess ? 'Bid Placed!' : `${getNextBidAmount(10)}`}
                        </span>
                        <span className="bid-button-label">{bidSuccess ? '' : '+10L'}</span>
                      </button>
                    )}
                  </div>
                  {!canBid(0) && !canBid(5) && !canBid(10) && (
                    <div className="cannot-bid">
                      <div className="notice-icon">⛔</div>
                      <div>
                        <p className="notice-title">Cannot Bid</p>
                        <small>
                          Max allowed: {getMaxAllowedBid()} 
                          <br />
                          (Need {(config.maxSquadSize - teamData.rosterSlotsFilled - 1) * config.minBasePrice} to complete {config.maxSquadSize - teamData.rosterSlotsFilled - 1} more players)
                        </small>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {error && <div className="error-message-mobile">{error}</div>}
          </div>
        ) : (
          <div className="waiting-section">
            <div className="waiting-animation">
              <div className="waiting-icon">⏳</div>
              <div className="pulse-ring"></div>
            </div>
            <h3>Waiting for Next Player</h3>
            <p>The admin will start the auction soon</p>
            <div className="waiting-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        {/* My Squad */}
        {teamData.players && teamData.players.length > 0 && (
          <div className="my-squad">
            <div className="squad-header">
              <div>
                <h3>🏏 My Squad</h3>
                <span className="squad-count">{teamData.players.length} player{teamData.players.length !== 1 ? 's' : ''}</span>
              </div>
              <a 
                href={`${API_URL}/teams/${teamData.id}/download`} 
                download 
                className="download-squad-btn"
              >
                <span>📥</span> Download
              </a>
            </div>
            <div className="squad-list">
              {teamData.players.map((player) => (
                <div key={player._id || player.name} className="squad-player">
                  <div className="squad-player-info">
                    <span className="squad-player-name">{player.name}</span>
                    <span className="squad-player-category">{player.category}</span>
                  </div>
                  <span className="squad-player-price">{player.soldPrice}</span>
                </div>
              ))}
            </div>
            <div className="squad-summary">
              <div className="summary-item">
                <span className="summary-label">Total Spent</span>
                <span className="summary-value">{teamData.players.reduce((sum, p) => sum + p.soldPrice, 0)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Avg Price</span>
                <span className="summary-value">{Math.round(teamData.players.reduce((sum, p) => sum + p.soldPrice, 0) / teamData.players.length)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

